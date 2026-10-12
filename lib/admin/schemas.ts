/**
 * CD-014: what a platform admin may enter for tariff measures, fees and special programs. Each
 * schema turns form text into a database row; the database enforces the same rules again
 * (0004_admin.sql), and the landed-cost engine validates once more when it reads the rows.
 */
import { z } from "zod";
import { isCountryCode } from "@/lib/countries";
import { Decimal } from "@/lib/tariff/money";

export const ENTITIES = ["measures", "fees", "programs"] as const;
export type Entity = (typeof ENTITIES)[number];
export const TABLES: Record<
  Entity,
  "tariff_measures" | "fee_schedules" | "special_programs"
> = {
  measures: "tariff_measures",
  fees: "fee_schedules",
  programs: "special_programs",
};

const MODES = ["postal", "express", "ocean", "air"] as const;
const FEE_TYPES = [
  "mpf_formal",
  "mpf_informal",
  "hmf",
  "carrier_brokerage",
  "informal_entry_limit",
] as const;
const RATE_TYPES = ["ad_valorem", "specific", "flat_per_item"] as const;

const blankToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;
/** Items separated by commas, spaces or new lines. */
const splitList = (v: unknown) =>
  typeof v === "string"
    ? v
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : v;

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable());
const isoDate = z.iso.date({ error: "Use a date like 2026-10-01." });
const optionalDate = z.preprocess(blankToNull, isoDate.nullable());
const https = z
  .url({ protocol: /^https$/, error: "Use an https link to the source." })
  .max(2000);
const decimal = (intDigits: number, places: number, label: string) =>
  z
    .string()
    .trim()
    .regex(
      new RegExp(`^\\d{1,${intDigits}}(\\.\\d{1,${places}})?$`),
      `${label}: a number like 12.50 (at most ${places} decimals).`,
    );
const optionalDecimal = (intDigits: number, places: number, label: string) =>
  z.preprocess(blankToNull, decimal(intDigits, places, label).nullable());

/** HTS prefixes as written ("6109", "6109.10") stored as digits only. */
const prefixes = (min: number) =>
  z.preprocess(
    splitList,
    z
      .array(
        z
          .string()
          .transform((s) => s.replace(/\./g, ""))
          .pipe(
            z
              .string()
              .regex(
                /^\d{2,10}$/,
                "HTS prefixes are 2–10 digits, e.g. 6109 or 6109.10.",
              ),
          ),
      )
      .min(min, "Enter at least one HTS prefix.")
      .max(5000),
  );
const countries = (allowAll: boolean) =>
  z.preprocess(
    (v) =>
      Array.isArray(splitList(v))
        ? (splitList(v) as string[]).map((s) => s.toUpperCase())
        : v,
    z
      .array(
        z
          .string()
          .refine(
            (s) => (allowAll && s === "**") || isCountryCode(s),
            allowAll
              ? "Use two-letter country codes (CN, VN) or ** for all origins."
              : "Use two-letter country codes (MX, CA).",
          ),
      )
      .min(1, "Enter at least one country.")
      .max(300),
  );
const programSymbol = z
  .string()
  .regex(
    /^[A-Z0-9]{1,3}[+*]?$/,
    "Program symbols are written as in the Special column, e.g. S, A+, AU.",
  );

const dates = <
  T extends { effective_from: string; effective_to: string | null },
>(
  r: T,
) => r.effective_to === null || r.effective_to >= r.effective_from;
const datesIssue = {
  path: ["effective_to"],
  message: "The end date must be on or after the start date.",
};

export const measureSchema = z
  .object({
    authority: text(200),
    ch99_code: z.preprocess(
      blankToNull,
      z
        .string()
        .trim()
        .regex(
          /^99\d{2}\.\d{2}\.\d{2}$/,
          "Chapter 99 codes look like 9903.88.03.",
        )
        .nullable(),
    ),
    hts_prefixes: prefixes(1),
    excluded_prefixes: prefixes(0),
    origin_countries: countries(true),
    rate_type: z.enum(RATE_TYPES),
    rate_value: decimal(6, 4, "Rate"),
    applies_to_modes: z
      .array(z.enum(MODES))
      .min(1, "Choose at least one mode."),
    /** null: nobody has checked which programs are exempt; []: none are. */
    exempt_programs: z.union([
      z.null(),
      z.preprocess(splitList, z.array(programSymbol).max(50)),
    ]),
    effective_from: isoDate,
    effective_to: optionalDate,
    source_url: https,
    notes: optionalText(2000),
  })
  .refine(dates, datesIssue);

export const feeSchema = z
  .object({
    fee_type: z.enum(FEE_TYPES),
    mode: z.preprocess(blankToNull, z.enum(MODES).nullable()),
    carrier: optionalText(100),
    pct: optionalDecimal(3, 5, "Percentage"),
    flat_amount: optionalDecimal(8, 2, "Flat amount"),
    min_amount: optionalDecimal(8, 2, "Minimum"),
    max_amount: optionalDecimal(8, 2, "Maximum"),
    effective_from: isoDate,
    effective_to: optionalDate,
    source_url: https,
    notes: optionalText(2000),
  })
  .refine(dates, datesIssue)
  .refine(
    (r) =>
      r.fee_type === "informal_entry_limit"
        ? r.flat_amount !== null
        : r.pct !== null || r.flat_amount !== null,
    {
      path: ["flat_amount"],
      message:
        "Enter a percentage or a flat amount (the informal entry limit goes in Flat amount).",
    },
  )
  .refine(
    (r) =>
      r.min_amount === null ||
      r.max_amount === null ||
      new Decimal(r.min_amount).lte(r.max_amount),
    {
      path: ["max_amount"],
      message: "The maximum must be at least the minimum.",
    },
  );

export const programSchema = z
  .object({
    symbol: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
      programSymbol,
    ),
    name: text(200),
    countries: countries(false),
    mpf_exempt: z.boolean(),
    effective_from: isoDate,
    effective_to: optionalDate,
    source_url: https,
    notes: optionalText(2000),
  })
  .refine(dates, datesIssue);

export const SCHEMAS = {
  measures: measureSchema,
  fees: feeSchema,
  programs: programSchema,
};

/** Read a form into the plain object the schema expects (checkbox groups become arrays). */
export function formToInput(
  entity: Entity,
  form: FormData,
): Record<string, unknown> {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : null;
  };
  switch (entity) {
    case "measures":
      return {
        authority: get("authority"),
        ch99_code: get("ch99_code"),
        hts_prefixes: get("hts_prefixes"),
        excluded_prefixes: get("excluded_prefixes") ?? "",
        origin_countries: get("origin_countries"),
        rate_type: get("rate_type"),
        rate_value: get("rate_value"),
        applies_to_modes: form.getAll("applies_to_modes"),
        exempt_programs:
          get("exempt_known") === "on" ? (get("exempt_programs") ?? "") : null,
        effective_from: get("effective_from"),
        effective_to: get("effective_to"),
        source_url: get("source_url"),
        notes: get("notes"),
      };
    case "fees":
      return {
        fee_type: get("fee_type"),
        mode: get("mode"),
        carrier: get("carrier"),
        pct: get("pct"),
        flat_amount: get("flat_amount"),
        min_amount: get("min_amount"),
        max_amount: get("max_amount"),
        effective_from: get("effective_from"),
        effective_to: get("effective_to"),
        source_url: get("source_url"),
        notes: get("notes"),
      };
    case "programs":
      return {
        symbol: get("symbol"),
        name: get("name"),
        countries: get("countries"),
        mpf_exempt: get("mpf_exempt") === "on",
        effective_from: get("effective_from"),
        effective_to: get("effective_to"),
        source_url: get("source_url"),
        notes: get("notes"),
      };
  }
}

/** Field errors keyed by field name, first message each. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

export { FEE_TYPES, MODES, RATE_TYPES };
