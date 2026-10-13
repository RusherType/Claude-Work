/**
 * Product facts: what the classification depends on beyond the title and description. The agent
 * extracts them (CD-030, which adds `missing`); sellers correct them on the product page (CD-024).
 * Stored in products.facts (jsonb, at most 64 KB); part of the content hash, so a change marks a
 * confirmed code Outdated.
 */
import { z } from "zod";
import { text } from "./schema";

export const MAX_MATERIALS = 8;

const percent = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d)?$/, "a percentage like 60 or 37.5")
  .refine((s) => Number(s) > 0 && Number(s) <= 100, "between 0 and 100");

export const factsSchema = z
  .strictObject({
    materials: z
      .array(
        z.strictObject({
          name: text(100),
          /** Share by weight, as written ("60", "37.5"); null when unknown. */
          percent: percent.nullable(),
        }),
      )
      .max(MAX_MATERIALS),
    /** What it does or is for: "worn as a T-shirt", "holds hot drinks". */
    function: text(300).nullable(),
    /** Who uses it: men, women, children, unisex, industrial, ... */
    user: text(100).nullable(),
    /** How it is made or what it is: knitted, woven, moulded, assembled set, ... */
    form: text(200).nullable(),
    /** Questions the agent still needs answered (written by the agent, kept as is here). */
    missing: z.array(text(300)).max(20).optional(),
  })
  .refine(
    // Tenths of a percent as integers, so 33.3 + 66.7 is exactly 100.
    (f) =>
      f.materials.reduce(
        (sum, m) => sum + (m.percent ? Math.round(Number(m.percent) * 10) : 0),
        0,
      ) <= 1000,
    {
      path: ["materials"],
      message: "material percentages add up to more than 100",
    },
  );
export type Facts = z.infer<typeof factsSchema>;

export const EMPTY_FACTS: Facts = {
  materials: [],
  function: null,
  user: null,
  form: null,
};

/** Stored facts (any shape, from older rows or the agent) as editable facts; unknown keys dropped. */
export function readFacts(stored: unknown): Facts {
  if (!stored || typeof stored !== "object" || Array.isArray(stored))
    return EMPTY_FACTS;
  const raw = stored as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const materials = Array.isArray(raw.materials)
    ? raw.materials
        .filter(
          (m): m is Record<string, unknown> => !!m && typeof m === "object",
        )
        .map((m) => ({
          name: str(m.name) ?? "",
          percent:
            typeof m.percent === "number" || typeof m.percent === "string"
              ? String(m.percent)
              : null,
        }))
        .filter((m) => m.name)
        .slice(0, MAX_MATERIALS)
    : [];
  // Kept within the schema's limits, so stored questions can never make a save impossible.
  const missing = Array.isArray(raw.missing)
    ? raw.missing
        .filter((q): q is string => text(300).safeParse(q).success)
        .map((q) => q.trim())
        .slice(0, 20)
    : undefined;
  return {
    materials,
    function: str(raw.function),
    user: str(raw.user),
    form: str(raw.form),
    ...(missing ? { missing } : {}),
  };
}
