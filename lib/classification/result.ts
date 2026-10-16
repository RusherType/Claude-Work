/**
 * What the agent stores on a classification row besides the code (CD-032 writes these shapes;
 * CD-042 shows them). The page reads them leniently: anything malformed is left out rather
 * than breaking the card.
 */
import { z } from "zod";

const HTS10 = /^\d{10}$/;
const shortText = (max: number) => z.string().trim().min(1).max(max);

/** A line the agent considered and why it lost. */
export const alternativeSchema = z.object({
  code: z.string().regex(HTS10),
  why: shortText(500),
});
export type Alternative = z.infer<typeof alternativeSchema>;

/** Evidence: a CBP ruling or a legal note (section, chapter or GRI). */
export const citationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ruling"),
    number: z.string().regex(/^[A-Z]{1,2}\d{5,7}$/),
    note: shortText(300).optional(),
  }),
  z.object({
    kind: z.literal("note"),
    ref: shortText(100),
    note: shortText(300).optional(),
  }),
]);
export type Citation = z.infer<typeof citationSchema>;

export const MAX_ALTERNATIVES = 5;
export const MAX_CITATIONS = 10;

function readList<T>(value: unknown, schema: z.ZodType<T>, max: number): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
    if (out.length === max) break;
  }
  return out;
}

export const readAlternatives = (value: unknown) =>
  readList(value, alternativeSchema, MAX_ALTERNATIVES);
export const readCitations = (value: unknown) =>
  readList(value, citationSchema, MAX_CITATIONS);

/** The General Rules of Interpretation applied, in order ("GRI 1", "GRI 3(b)", "GRI 6"). */
export const readGriPath = (value: unknown) =>
  readList(value, z.string().regex(/^GRI \d(\([a-c]\))?$/), 6);

/** Ruling numbers cited, without duplicates. */
export function citedRulings(citations: Citation[]): string[] {
  return [
    ...new Set(
      citations.flatMap((c) => (c.kind === "ruling" ? [c.number] : [])),
    ),
  ];
}

/** Below this, the card says the code needs a closer look (docs/04-frontend.md ConfidenceBar). */
export const LOW_CONFIDENCE = 0.6;

/** Filled segments of the 5-segment confidence bar. */
export function confidenceSegments(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.min(5, Math.max(0, Math.round(confidence * 5)));
}

export const isLowConfidence = (confidence: number) =>
  confidence < LOW_CONFIDENCE;

/** A link we are willing to render: https only (ruling URLs come from a crawler). */
export function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
