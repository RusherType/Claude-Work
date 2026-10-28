"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import {
  answerSchema,
  confirmSchema,
  decisionMessage,
  formFields,
  overrideSchema,
  readReturn,
  returnPath,
} from "@/lib/classification/decisions";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type ClassStatus = Database["public"]["Enums"]["class_status"];

// CD-041: confirm, override and answer. Zod checks the form; the database functions check the
// role, that the person saw the current state, and write the audit row
// (supabase/migrations/0006_review.sql). Codes are never written from here directly.

export type DecisionState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      errors?: Record<string, string>;
      /** What was submitted, so the form shows it again (React resets forms after actions). */
      values?: Record<string, string>;
      attempt?: number;
    };

function failure(
  fields: Record<string, string>,
  message: string,
  errors?: Record<string, string>,
): DecisionState {
  return {
    status: "error",
    message,
    errors,
    values: fields,
    attempt: Date.now(),
  };
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues)
    out[String(issue.path[0])] ??= issue.message;
  return out;
}

async function session() {
  const [user, supabase] = await Promise.all([
    getCurrentUser(),
    createClient(),
  ]);
  return user && supabase ? supabase : null;
}

/** Refresh every page that shows a status chip or the queue badge. */
function refresh() {
  revalidatePath("/app", "layout");
}

export async function confirmCode(
  _prev: DecisionState,
  form: FormData,
): Promise<DecisionState> {
  const fields = formFields(form);
  const parsed = confirmSchema.safeParse(fields);
  if (!parsed.success) return failure(fields, "Reload the page and try again.");
  const supabase = await session();
  if (!supabase)
    return failure(fields, "Your session has ended. Sign in again.");

  const { error } = await supabase.rpc("confirm_classification", {
    p_classification: parsed.data.classificationId,
    p_code: parsed.data.code,
    p_content_hash: parsed.data.contentHash,
  });
  if (error) return failure(fields, decisionMessage("confirm", error).message);

  refresh();
  redirect(returnPath(readReturn(fields), parsed.data.productId, "confirmed"));
}

export async function overrideCode(
  _prev: DecisionState,
  form: FormData,
): Promise<DecisionState> {
  const fields = formFields(form);
  const parsed = overrideSchema.safeParse(fields);
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    const hidden = !errors.code && !errors.reason;
    return failure(
      fields,
      hidden ? "Reload the page and try again." : "Fix the highlighted fields.",
      errors,
    );
  }
  const supabase = await session();
  if (!supabase)
    return failure(fields, "Your session has ended. Sign in again.");

  const { error } = await supabase.rpc("override_classification", {
    p_product: parsed.data.productId,
    // All null for a product with no code yet (the generated types do not know they are nullable).
    p_expected: parsed.data.expectedId as string,
    p_expected_code: parsed.data.expectedCode as string,
    p_expected_status: parsed.data.expectedStatus as ClassStatus,
    p_code: parsed.data.code,
    p_reason: parsed.data.reason,
    p_content_hash: parsed.data.contentHash,
  });
  if (error) {
    const { message, field } = decisionMessage("override", error);
    return failure(fields, message, field ? { [field]: message } : undefined);
  }

  refresh();
  redirect(returnPath(readReturn(fields), parsed.data.productId, "overridden"));
}

export async function answerQuestion(
  _prev: DecisionState,
  form: FormData,
): Promise<DecisionState> {
  const fields = formFields(form);
  // A chip sends its text as `choice`; "Other" sends the typed `answer`.
  const parsed = answerSchema.safeParse({
    ...fields,
    answer: fields.choice ?? fields.answer,
  });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return failure(
      fields,
      errors.answer
        ? "Type an answer first."
        : "Reload the page and try again.",
      errors.answer ? { answer: "Type an answer first." } : undefined,
    );
  }
  const supabase = await session();
  if (!supabase)
    return failure(fields, "Your session has ended. Sign in again.");

  const { error } = await supabase.rpc("answer_agent_question", {
    p_question: parsed.data.questionId,
    p_answer: parsed.data.answer,
  });
  if (error) {
    const { message, field } = decisionMessage("answer", error);
    return failure(fields, message, field ? { [field]: message } : undefined);
  }

  // In the queue, stay on this product while it still has questions; otherwise move on.
  const to = readReturn(fields);
  let stayAt: string | undefined;
  if (to.from === "review" && parsed.data.classificationId) {
    const still = await supabase
      .from("review_queue")
      .select("id")
      .eq("id", parsed.data.classificationId)
      .maybeSingle();
    if (still.data?.id) stayAt = still.data.id;
  }
  refresh();
  redirect(returnPath(to, parsed.data.productId, "answered", stayAt));
}
