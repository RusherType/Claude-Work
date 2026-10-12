import type { ParsedRate, SpecialRate, Unit } from "../rate";

export type Mode = "postal" | "express" | "ocean" | "air";
export const MODES: readonly Mode[] = ["postal", "express", "ocean", "air"];

export type FeeType =
  | "mpf_formal"
  | "mpf_informal"
  | "hmf"
  | "carrier_brokerage"
  | "informal_entry_limit";
export const FEE_TYPES: readonly FeeType[] = [
  "mpf_formal",
  "mpf_informal",
  "hmf",
  "carrier_brokerage",
  "informal_entry_limit",
];

export type Measure = {
  id: string;
  authority: string;
  ch99Code: string | null;
  htsPrefixes: string[];
  excludedPrefixes: string[];
  originCountries: string[];
  rateType: "ad_valorem" | "specific" | "flat_per_item";
  /** Percent for ad valorem ("25" = 25%), US dollars per item for flat_per_item. */
  rateValue: string;
  appliesToModes: Mode[];
  /**
   * Program symbols whose qualifying goods do not pay this measure (e.g. "S" for USMCA). Leave it
   * out when nobody has checked: a line claiming a program then goes to review.
   */
  exemptPrograms?: string[];
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceUrl: string;
};

export type Fee = {
  id: string;
  feeType: FeeType;
  mode: Mode | null;
  carrier: string | null;
  /** Percent of value ("0.3464" = 0.3464%). */
  pct: string | null;
  /** US dollars; for informal_entry_limit, the limit itself. */
  flatAmount: string | null;
  minAmount: string | null;
  maxAmount: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceUrl: string | null;
};

/**
 * Who may claim a special program symbol, from the HTSUS General Notes. `symbol` is written as in
 * the Special column ("A", "A+", "S", "AU").
 */
export type Program = {
  symbol: string;
  countries: string[];
  /** Qualifying goods pay no merchandise processing fee (19 CFR 24.23(c)). */
  mpfExempt: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceUrl: string;
};

export type CostLine = {
  id: string;
  /** 10-digit HTSUS code, dots allowed. */
  code: string;
  origin: string;
  /** Customs value of the line in the shipment currency. */
  value: string;
  /** Item count. Also the quantity for rates "each". */
  quantity: number;
  /** Quantities in other units, e.g. `{ kg: "12.5" }`. */
  quantities?: Partial<Record<Unit, string>>;
  generalRate: ParsedRate;
  specialRates?: SpecialRate[];
  column2Rate?: ParsedRate;
  claimedProgram?: string;
  /** Anything but "confirmed" is treated as a suggested code. */
  codeStatus?: "confirmed" | "suggested";
};

export type Shipment = {
  mode: Mode;
  entryDate: string;
  currency: string;
  /** US dollars per one unit of `currency`. */
  fxRateToUsd: string;
  carrier?: string;
  column2Countries: string[];
};

export type LandedCostInput = {
  lines: CostLine[];
  shipment: Shipment;
  measures: Measure[];
  fees: Fee[];
  programs?: Program[];
};

export type Source =
  | {
      table: "tariff_lines";
      code: string;
      column: "general" | "special" | "column2";
      program?: string;
    }
  | {
      table: "tariff_measures" | "fee_schedules";
      id: string;
      effectiveFrom: string;
      effectiveTo: string | null;
      sourceUrl: string | null;
    };

export type Component = {
  kind:
    | "duty_general"
    | "duty_special"
    | "duty_column2"
    | "overlay"
    | "mpf"
    | "hmf"
    | "carrier_fee";
  label: string;
  basis: string;
  amount: string;
  source?: Source;
};

export type LineResult = {
  id: string;
  status: "ok" | "needs_review";
  customsValueUsd: string;
  components: Component[];
  dutyTotal: string;
  allocatedFees: string;
  landedCost: string;
  warnings: string[];
};

export type LandedCostResult = {
  status: "ok" | "needs_review";
  entryType: "formal" | "informal";
  lines: LineResult[];
  shipmentFees: Component[];
  totals: {
    customsValue: string;
    duties: string;
    fees: string;
    landedCost: string;
  };
  warnings: string[];
};
