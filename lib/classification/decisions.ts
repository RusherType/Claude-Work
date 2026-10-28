/**
 * CD-041: what a person submits to confirm, override or answer, and the messages for what the
 * database functions refuse (supabase/migrations/0006_review.sql).
 */
import { z } from "zod";
import { text } from "@/lib/catalog/schema";

const contentHash = z.string().regex(/^[0-9a-f]{64}$/);

/** "6109.10.0012", "6109 10 0012" or "6109100012" → digits; anything else fails. */
export const htsInput = z
  .string()
  .transform((s) => s.replace(/[\s.]/g, ""))
  .pipe(
    z.string().regex(/^\d{10}$/, "Enter all 10 digits, like 6109.10.0012."),
  );

/** Where to go after a decision: the next item in the queue, or back to the product. */
export const returnSchema = z.discriminatedUnion("from", [
  z.object({ from: z.literal("review"), nextId: z.uuid().optional() }),
  z.object({ from: z.literal("product") }),
]);
export type ReturnTo = z.infer<typeof returnSchema>;

/** Statuses a classification can be in (the class_status enum). */
export const CLASS_STATUSES = [
  "queued",
  "needs_answer",
  "in_review",
  "suggested",
  "confirmed",
  "broker_verified",
  "outdated",
] as const;

const empty = z.literal("").transform(() => null);

export const confirmSchema = z.object({
  classificationId: z.uuid(),
  productId: z.uuid(),
  /** The code the person saw: confirming never applies to a code they were not shown. */
  code: htsInput,
  contentHash,
});

export const overrideSchema = z.object({
  productId: z.uuid(),
  /** The current classification the person saw, its code and status; empty when there was none. */
  expectedId: z.union([z.uuid(), empty]),
  expectedCode: z.union([htsInput, empty]),
  expectedStatus: z.union([z.enum(CLASS_STATUSES), empty]),
  code: htsInput,
  reason: text(500).refine(
    // Counted in characters, as the database's char_length does.
    (s) => [...s].length >= 3,
    "Say in a few words why this code is right.",
  ),
  contentHash,
});

export const answerSchema = z.object({
  questionId: z.uuid(),
  productId: z.uuid(),
  /** The queue item the question was answered from (empty on the product page). */
  classificationId: z
    .union([z.uuid(), z.literal("").transform(() => undefined)])
    .optional(),
  answer: text(300),
});

/** Plain form fields as a record (Server Action internals and files left out). */
export function formFields(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("$ACTION") && typeof v === "string") out[k] = v;
  }
  return out;
}

/** Return target from the form; anything unexpected goes back to the product page. */
export function readReturn(fields: Record<string, string>): ReturnTo {
  const parsed = returnSchema.safeParse({
    from: fields.from,
    ...(fields.nextId ? { nextId: fields.nextId } : {}),
  });
  return parsed.success ? parsed.data : { from: "product" };
}

export type Decision = "confirmed" | "overridden" | "answered";

/** The page to show after a decision. Built from validated ids only (no open redirects). */
export function returnPath(
  to: ReturnTo,
  productId: string,
  done: Decision,
  stayAt?: string,
): string {
  if (to.from === "review") {
    const at = stayAt ?? to.nextId;
    return `/app/review?${at ? `at=${at}&` : ""}done=${done}`;
  }
  return `/app/catalog/${productId}?decided=${done}`;
}

export type DbFailure = { code?: string; message?: string } | null;

/** What to tell the person when the database refuses a decision. */
export function decisionMessage(
  kind: "confirm" | "override" | "answer",
  error: NonNullable<DbFailure>,
): { message: string; field?: string } {
  if (error.message === "not_authenticated")
    return { message: "Your session has ended. Sign in again." };
  if (error.code === "42501")
    return {
      message:
        kind === "answer"
          ? "You can't answer questions in this workspace. Reload, or ask an owner or admin about your role."
          : "You can't change codes in this workspace. Reload, or ask an owner or admin about your role.",
    };
  switch (error.message) {
    case "broker_verified":
      return {
        message:
          "A licensed broker verified this code. Only an owner or admin can replace it.",
      };
    case "stale":
      return {
        message:
          "This product or its code changed since you opened it. Reload to see the latest, then decide again.",
      };
    case "not_confirmable":
      return {
        message:
          "This code can't be confirmed as it is now. Reload to see its current state.",
      };
    case "unknown_code":
      return kind === "override"
        ? {
            message:
              "That code isn't a line you can file under in the tariff in force today. Check the digits.",
            field: "code",
          }
        : {
            message:
              "This code isn't in the tariff in force today. Use a different code instead.",
          };
    case "invalid_reason":
      return {
        message: "Say in a few words why this code is right.",
        field: "reason",
      };
    case "already_answered":
      return {
        message: "Someone already answered this question. Reload to see it.",
      };
    case "invalid_answer":
      return { message: "Type an answer first.", field: "answer" };
    default:
      return {
        message: "Couldn't save because of a problem on our side. Try again.",
      };
  }
}
