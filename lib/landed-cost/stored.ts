/**
 * CD-051: a saved quote is a record of what was quoted, shown as stored rather than recomputed.
 * The JSON is read back through these schemas: a member can call save_quote directly with any
 * JSON, so nothing is rendered unless it has the expected shape, and source links are https only.
 */
import { z } from "zod";
import type {
  Component,
  LandedCostResult,
  LineResult,
} from "@/lib/tariff/landed-cost/types";

/** A US-dollar amount as the engine writes it. Wide enough for the largest quote the form allows. */
export const MONEY = /^-?\d{1,30}(\.\d{1,2})?$/;
const money = z.string().regex(MONEY);
const shortText = z.string().max(500);
const httpsUrl = z
  .string()
  .max(2000)
  .refine((s) => {
    try {
      return new URL(s).protocol === "https:";
    } catch {
      return false;
    }
  });

const sourceSchema = z.union([
  z.object({
    table: z.literal("tariff_lines"),
    code: z.string().max(20),
    column: z.enum(["general", "special", "column2"]),
    program: z.string().max(10).optional(),
  }),
  z.object({
    table: z.enum(["tariff_measures", "fee_schedules"]),
    id: z.string().max(64),
    effectiveFrom: z.string().max(10),
    effectiveTo: z.string().max(10).nullable(),
    // A non-https link is dropped, not rendered.
    sourceUrl: httpsUrl.nullable().catch(null),
  }),
]);

const componentSchema = z.object({
  kind: z.enum([
    "duty_general",
    "duty_special",
    "duty_column2",
    "overlay",
    "mpf",
    "hmf",
    "carrier_fee",
  ]),
  label: shortText,
  basis: shortText,
  amount: money,
  source: sourceSchema.optional(),
}) satisfies z.ZodType<Component>;

export const lineResultSchema = z.object({
  id: z.string().max(64),
  status: z.enum(["ok", "needs_review"]),
  customsValueUsd: money,
  components: z.array(componentSchema).max(50),
  dutyTotal: money,
  allocatedFees: money,
  landedCost: money,
  warnings: z.array(shortText).max(50),
}) satisfies z.ZodType<LineResult>;

/** quotes.totals: the shipment-level part of the engine result, plus data notices. */
export const storedTotalsSchema = z.object({
  status: z.enum(["ok", "needs_review"]),
  entryType: z.enum(["formal", "informal"]),
  shipmentFees: z.array(componentSchema).max(20),
  totals: z.object({
    customsValue: money,
    duties: money,
    fees: money,
    landedCost: money,
  }),
  warnings: z.array(shortText).max(50),
  notices: z.array(shortText).max(10),
});
export type StoredTotals = z.infer<typeof storedTotalsSchema>;

/** What quotes.totals stores for a computed result. */
export function totalsToStore(
  result: LandedCostResult,
  notices: string[],
): StoredTotals {
  return {
    status: result.status,
    entryType: result.entryType,
    shipmentFees: result.shipmentFees,
    totals: result.totals,
    warnings: result.warnings,
    notices,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The measure and fee rows a stored breakdown points at (valid ids only, no duplicates). */
export function referencedRows(components: Component[]): {
  tariff_measures: string[];
  fee_schedules: string[];
} {
  const out = {
    tariff_measures: new Set<string>(),
    fee_schedules: new Set<string>(),
  };
  for (const c of components) {
    const s = c.source;
    if (s && s.table !== "tariff_lines" && UUID.test(s.id))
      out[s.table].add(s.id);
  }
  return {
    tariff_measures: [...out.tariff_measures],
    fee_schedules: [...out.fee_schedules],
  };
}

/**
 * Source links as the reference rows have them now (`urls` keyed "table:id"), never as stored:
 * a quote saved with a made-up link shows no link at all.
 */
export function relinkSources(
  components: Component[],
  urls: ReadonlyMap<string, string>,
): Component[] {
  return components.map((c) => {
    const s = c.source;
    if (!s || s.table === "tariff_lines") return c;
    const url = httpsUrl.safeParse(urls.get(`${s.table}:${s.id}`));
    return { ...c, source: { ...s, sourceUrl: url.success ? url.data : null } };
  });
}

/** More distinct measure or fee rows than any real quote points at: treat the quote as not ours. */
export const MAX_REFERENCED_ROWS = 200;

/**
 * What a person was shown, as one string: the status, the totals, and each line's code, whether
 * it was confirmed, its status and its landed cost. Save compares it with what the server
 * computes at that moment, so nothing that changed in between is saved unseen.
 */
export function figuresDigest(
  result: Pick<LandedCostResult, "status" | "entryType" | "totals">,
  lines: {
    code: string;
    confirmed: boolean;
    result: Pick<LineResult, "status" | "landedCost">;
  }[],
): string {
  return JSON.stringify([
    result.status,
    result.entryType,
    result.totals.customsValue,
    result.totals.duties,
    result.totals.fees,
    result.totals.landedCost,
    lines.map((l) => [l.code, l.confirmed, l.result.status, l.result.landedCost]),
  ]);
}
