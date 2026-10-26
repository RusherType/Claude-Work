/**
 * Turns one chapter of the USITC HTS export into rows for `tariff_lines` (CD-010).
 * Pure: no network, no database. See lib/tariff/usitc.ts for fetching.
 *
 * - Codes are stored digits-only; codeless grouping rows ("Men's or boys':") keep code "".
 * - 10-digit statistical lines carry no rate of their own: they inherit the rate of the
 *   nearest ancestor that has one, and `rate.inherited_from` says which.
 * - A line is a leaf when it has 8 or 10 digits and the next line is not indented under it.
 */
import { z } from "zod";
import {
  parseRate,
  parseSpecialRates,
  type ParsedRate,
  type SpecialRate,
} from "./rate";

export const usitcRowSchema = z.object({
  htsno: z
    .string()
    .nullish()
    .transform((v) => v ?? ""),
  indent: z.coerce.number().int().min(0),
  description: z
    .string()
    .nullish()
    .transform((v) => (v ?? "").trim()),
  superior: z.string().nullish(),
  units: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  general: z
    .string()
    .nullish()
    .transform((v) => v ?? ""),
  special: z
    .string()
    .nullish()
    .transform((v) => v ?? ""),
  other: z
    .string()
    .nullish()
    .transform((v) => v ?? ""),
  footnotes: z
    .array(
      z.object({
        columns: z.array(z.string()).nullish(),
        marker: z.string().nullish(),
        value: z.string().nullish(),
      }),
    )
    .nullish()
    .transform((v) => v ?? []),
});
export type UsitcRow = z.output<typeof usitcRowSchema>;

export interface LineRate {
  general: ParsedRate;
  special: SpecialRate[];
  column2: ParsedRate;
  /** Digits-only code the rates were taken from, when this line has none of its own */
  inherited_from: string | null;
}

export interface TariffLineRow {
  position: number;
  code: string;
  indent: number;
  description: string;
  full_path: string;
  general_rate_raw: string | null;
  special_rate_raw: string | null;
  column2_rate_raw: string | null;
  rate: LineRate | null;
  units: string[];
  footnotes: { columns: string[]; marker: string; value: string }[];
  is_leaf: boolean;
}

const digits = (htsno: string) => htsno.replace(/[^\d]/g, "");
const blank = (s: string) => s.trim() === "";

/**
 * @param rows   one chapter's rows in schedule order
 * @param offset added to each row's index to give a schedule-wide position
 */
export function buildChapterLines(
  rows: UsitcRow[],
  offset: number,
): TariffLineRow[] {
  // ancestors[i] = the nearest preceding row at indent i
  const ancestors: {
    description: string;
    code: string;
    rates: Omit<LineRate, "inherited_from"> | null;
  }[] = [];

  return rows.map((row, i) => {
    const code = digits(row.htsno);
    const ownRates =
      blank(row.general) && blank(row.special) && blank(row.other)
        ? null
        : {
            general: parseRate(row.general),
            special: parseSpecialRates(row.special),
            column2: parseRate(row.other),
          };

    ancestors.length = row.indent;
    const path = [
      ...ancestors.map((a) => a?.description).filter(Boolean),
      row.description,
    ].join(" › ");

    let rate: LineRate | null = null;
    if (ownRates) {
      rate = { ...ownRates, inherited_from: null };
    } else if (code.length >= 8) {
      const source = [...ancestors].reverse().find((a) => a?.rates);
      if (source?.rates)
        rate = { ...source.rates, inherited_from: source.code };
    }

    ancestors[row.indent] = {
      description: row.description.replace(/:$/, ""),
      code,
      rates: ownRates,
    };

    const next = rows[i + 1];
    return {
      position: offset + i,
      code,
      indent: row.indent,
      description: row.description,
      full_path: path.replace(/:(?= ›|$)/g, ""),
      general_rate_raw: blank(row.general) ? null : row.general.trim(),
      special_rate_raw: blank(row.special) ? null : row.special.trim(),
      column2_rate_raw: blank(row.other) ? null : row.other.trim(),
      rate,
      units: row.units,
      footnotes: row.footnotes.map((f) => ({
        columns: f.columns ?? [],
        marker: f.marker ?? "",
        value: (f.value ?? "").trim(),
      })),
      // Only 8- and 10-digit lines can be leaves; a heading at the end of a range is not one
      is_leaf: code.length >= 8 && (!next || next.indent <= row.indent),
    };
  });
}

/** Two-digit chapter ids "01" … "99". */
export const CHAPTERS = Array.from({ length: 99 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);

/** Positions are spaced per chapter so re-importing one chapter never collides with another. */
export const chapterOffset = (chapter: string) => Number(chapter) * 100_000;
