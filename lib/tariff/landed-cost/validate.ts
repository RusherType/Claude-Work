/**
 * Input checks. Anything malformed throws a named "Invalid ..." error instead of producing NaN or
 * silently skipping a row. Callers validate user input with Zod first; these checks also catch
 * bad reference data (measures, fees, programs).
 */
import { dec, decOrNull, isoDate, type Decimal } from "../money";
import { digits } from "./shared";
import {
  FEE_TYPES,
  MODES,
  type CostLine,
  type Fee,
  type LandedCostInput,
  type Measure,
  type Program,
} from "./types";

const COUNTRY = /^[A-Z]{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const RATE_TYPES = ["ad_valorem", "specific", "flat_per_item"];

function fail(what: string, value: unknown): never {
  throw new Error(`Invalid ${what}: ${JSON.stringify(value)}`);
}

function stringArray(value: unknown, what: string, item?: RegExp): string[] {
  if (
    !Array.isArray(value) ||
    value.some((v) => typeof v !== "string" || (item && !item.test(v)))
  ) {
    fail(what, value);
  }
  return value;
}

function dateRange(
  row: { effectiveFrom: string; effectiveTo: string | null },
  what: string,
) {
  isoDate(row.effectiveFrom, `effective date for ${what}`);
  if (row.effectiveTo !== null) {
    isoDate(row.effectiveTo, `end date for ${what}`);
  }
}

/** Checks everything and returns the parsed entry date and exchange rate. */
export function validateInput(input: LandedCostInput): {
  entryDate: string;
  fx: Decimal;
} {
  const { shipment } = input;
  const entryDate = isoDate(shipment.entryDate, "entry date");
  if (!MODES.includes(shipment.mode)) fail("shipment mode", shipment.mode);
  if (!CURRENCY.test(shipment.currency)) fail("currency", shipment.currency);
  const fx = dec(shipment.fxRateToUsd, "exchange rate");
  if (fx.isZero())
    fail("exchange rate (must be above zero)", shipment.fxRateToUsd);
  if (shipment.currency === "USD" && !fx.equals(1)) {
    fail("exchange rate (USD must use 1)", shipment.fxRateToUsd);
  }
  stringArray(shipment.column2Countries, "Column 2 country list", COUNTRY);

  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    fail("lines (none given)", input.lines);
  }
  input.lines.forEach(validateLine);
  if (!Array.isArray(input.measures)) fail("measures", input.measures);
  if (!Array.isArray(input.fees)) fail("fees", input.fees);
  if (input.programs !== undefined && !Array.isArray(input.programs)) {
    fail("programs", input.programs);
  }
  input.measures.forEach(validateMeasure);
  input.fees.forEach(validateFee);
  (input.programs ?? []).forEach(validateProgram);
  return { entryDate, fx };
}

function validateLine(l: CostLine) {
  const what = (field: string) => `${field} for line ${l.id}`;
  if (!/^\d{10}$/.test(digits(l.code)) || /[^\d.]/.test(l.code)) {
    fail(what("HTS code (10 digits)"), l.code);
  }
  if (!COUNTRY.test(l.origin)) fail(what("origin"), l.origin);
  dec(l.value, what("value"));
  if (!Number.isInteger(l.quantity) || l.quantity < 0) {
    fail(what("quantity"), l.quantity);
  }
  for (const [unit, q] of Object.entries(l.quantities ?? {})) {
    dec(q, what(`${unit} quantity`));
  }
}

function validateMeasure(m: Measure) {
  const what = (field: string) => `${field} for measure ${m.id}`;
  dateRange(m, `measure ${m.id}`);
  if (!RATE_TYPES.includes(m.rateType)) fail(what("rate type"), m.rateType);
  dec(m.rateValue, what("rate value"));
  const prefix = /^[\d.]*\d[\d.]*$/;
  stringArray(m.htsPrefixes, what("HTS prefixes"), prefix);
  if (m.htsPrefixes.length === 0)
    fail(what("HTS prefixes (none)"), m.htsPrefixes);
  stringArray(m.excludedPrefixes, what("excluded prefixes"), prefix);
  stringArray(
    m.originCountries,
    what("origin countries"),
    /^(?:[A-Z]{2}|\*\*)$/,
  );
  const modes = stringArray(m.appliesToModes, what("modes"));
  if (modes.some((x) => !MODES.includes(x as never)))
    fail(what("modes"), modes);
  if (m.exemptPrograms !== undefined) {
    stringArray(m.exemptPrograms, what("exempt programs"));
  }
}

function validateFee(f: Fee) {
  const what = (field: string) => `${field} for fee ${f.id}`;
  dateRange(f, `fee ${f.id}`);
  if (!FEE_TYPES.includes(f.feeType)) fail(what("fee type"), f.feeType);
  if (f.mode !== null && !MODES.includes(f.mode)) fail(what("mode"), f.mode);
  if (f.carrier !== null && f.carrier.trim() === "")
    fail(what("carrier"), f.carrier);
  const pct = decOrNull(f.pct, what("percentage"));
  const flat = decOrNull(f.flatAmount, what("flat amount"));
  const min = decOrNull(f.minAmount, what("minimum"));
  const max = decOrNull(f.maxAmount, what("maximum"));
  if (f.feeType === "informal_entry_limit" ? !flat : !pct && !flat) {
    fail(what("amount (needs a percentage or flat amount)"), f);
  }
  if (min && max && min.gt(max))
    fail(what("minimum (above the maximum)"), f.minAmount);
}

function validateProgram(p: Program) {
  const what = (field: string) => `${field} for program ${p.symbol}`;
  if (typeof p.symbol !== "string" || !/^[A-Z0-9]{1,3}[+*]?$/.test(p.symbol)) {
    fail("program symbol", p.symbol);
  }
  dateRange(p, `program ${p.symbol}`);
  stringArray(p.countries, what("countries"), COUNTRY);
  if (typeof p.mpfExempt !== "boolean")
    fail(what("MPF exemption"), p.mpfExempt);
}
