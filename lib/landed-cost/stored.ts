/**
 * CD-051: a saved quote is a record of what was quoted, shown as stored rather than recomputed.
 * The JSON is read back through these schemas: members can also write quote rows through the Data
 * API, so nothing is rendered unless it has the expected shape, and source links are https only.
 */
import { z } from "zod";
import type {
  Component,
  LandedCostResult,
  LineResult,
} from "@/lib/tariff/landed-cost/types";

const money = z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/);
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
