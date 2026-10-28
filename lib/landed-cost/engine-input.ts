/**
 * CD-051: database rows (numerics read as text) turned into landed-cost engine input. Pure, so
 * the mapping is unit-tested; lib/landed-cost/load.ts does the reading.
 */
import type {
  CostLine,
  Fee,
  FeeType,
  Measure,
  Mode,
  Program,
} from "@/lib/tariff/landed-cost/types";
import { Decimal } from "@/lib/tariff/money";
import { parseRate, parseSpecialRates } from "@/lib/tariff/rate";

/**
 * The Column 2 country list is kept as a reserved `special_programs` row with this symbol, so it
 * is data with effective dates, a source and the admin publish workflow (HTSUS General Note 3(b)).
 */
export const COLUMN2_SYMBOL = "C2";

export type MeasureRow = {
  id: string;
  authority: string;
  ch99_code: string | null;
  hts_prefixes: string[];
  excluded_prefixes: string[] | null;
  origin_countries: string[];
  rate_type: string;
  rate_value: string;
  applies_to_modes: string[] | null;
  exempt_programs: string[] | null;
  effective_from: string;
  effective_to: string | null;
  source_url: string;
};

export type FeeRow = {
  id: string;
  fee_type: string;
  mode: string | null;
  carrier: string | null;
  pct: string | null;
  flat_amount: string | null;
  min_amount: string | null;
  max_amount: string | null;
  effective_from: string;
  effective_to: string | null;
  source_url: string | null;
};

export type ProgramRow = {
  symbol: string;
  countries: string[];
  mpf_exempt: boolean;
  effective_from: string;
  effective_to: string | null;
  source_url: string;
};

export type TariffLineRow = {
  code: string;
  general_rate_raw: string | null;
  special_rate_raw: string | null;
  column2_rate_raw: string | null;
};

export function toMeasure(r: MeasureRow): Measure {
  return {
    id: r.id,
    authority: r.authority,
    ch99Code: r.ch99_code,
    htsPrefixes: r.hts_prefixes,
    excludedPrefixes: r.excluded_prefixes ?? [],
    originCountries: r.origin_countries.map((c) => c.trim()),
    rateType: r.rate_type as Measure["rateType"],
    rateValue: r.rate_value,
    appliesToModes: (r.applies_to_modes ?? []) as Mode[],
    // null means nobody has checked, which the engine treats as "send claims to review".
    ...(r.exempt_programs === null
      ? {}
      : { exemptPrograms: r.exempt_programs }),
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    sourceUrl: r.source_url,
  };
}

export function toFee(r: FeeRow): Fee {
  return {
    id: r.id,
    feeType: r.fee_type as FeeType,
    mode: r.mode as Mode | null,
    carrier: r.carrier,
    pct: r.pct,
    flatAmount: r.flat_amount,
    minAmount: r.min_amount,
    maxAmount: r.max_amount,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    sourceUrl: r.source_url,
  };
}

/** Program rows for the engine, and the Column 2 countries in force on the entry date. */
export function toPrograms(
  rows: ProgramRow[],
  entryDate: string,
): { programs: Program[]; column2Countries: string[] } {
  const inForce = (r: ProgramRow) =>
    r.effective_from <= entryDate &&
    (r.effective_to === null || entryDate <= r.effective_to);
  const column2 = new Set<string>();
  const programs: Program[] = [];
  for (const r of rows) {
    const countries = r.countries.map((c) => c.trim());
    if (r.symbol === COLUMN2_SYMBOL) {
      if (inForce(r)) countries.forEach((c) => column2.add(c));
      continue;
    }
    programs.push({
      symbol: r.symbol,
      countries,
      mpfExempt: r.mpf_exempt,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      sourceUrl: r.source_url,
    });
  }
  return { programs, column2Countries: [...column2].sort() };
}

export type QuoteProduct = {
  id: string;
  code: string;
  /** Only "confirmed" or "broker_verified" count as confirmed; anything else is a suggestion. */
  status: string;
  weightKg: string | null;
};

/**
 * One engine line. A code missing from the tariff in force gets no rate, which the engine sends to
 * review rather than guessing. Net weight times quantity is given for rates per kilogram.
 */
export function toCostLine(
  product: QuoteProduct,
  tariffLine: TariffLineRow | undefined,
  quantity: number,
  unitValue: string,
  origin: string,
): CostLine {
  const confirmed =
    product.status === "confirmed" || product.status === "broker_verified";
  return {
    id: product.id,
    code: product.code,
    origin,
    value: new Decimal(unitValue).times(quantity).toFixed(2),
    quantity,
    ...(product.weightKg
      ? {
          quantities: {
            kg: new Decimal(product.weightKg).times(quantity).toString(),
          },
        }
      : {}),
    generalRate: parseRate(tariffLine?.general_rate_raw),
    specialRates: parseSpecialRates(tariffLine?.special_rate_raw) ?? [],
    column2Rate: parseRate(tariffLine?.column2_rate_raw),
    codeStatus: confirmed ? "confirmed" : "suggested",
  };
}
