/**
 * Parses HTS rate-of-duty text ("Free", "5.3%", "2.4¢/kg", "25¢/kg + 3.4%") into
 * structured components for the landed-cost engine (CD-011, docs/02-architecture.md).
 *
 * Numbers stay exact decimal strings — never floats. Anything the parser cannot fully
 * understand (sliding scales, "but not less than", "on drained weight"…) comes back as
 * `complex` with the raw text, so the cost engine asks for a manual rate instead of guessing.
 */

export type RateUnit =
  | "kg"
  | "liter"
  | "proof_liter"
  | "dozen"
  | "dozen_pairs"
  | "pair"
  | "each"
  | "head"
  | "gross"
  | "m"
  | "m2"
  | "m3"
  | "ton"
  | "thousand";

export type RateComponent =
  /** `percent: "5.3"` means 5.3% of customs value */
  | { type: "ad_valorem"; percent: string }
  /** `amountUsd: "0.024"` per one `unit` */
  | { type: "specific"; amountUsd: string; unit: RateUnit };

export type ParsedRate =
  | { kind: "free" }
  /** Duty is the sum of every component */
  | { kind: "rate"; components: RateComponent[] }
  | { kind: "complex"; raw: string; reason: string }
  | { kind: "empty" };

export interface SpecialRate {
  rate: ParsedRate;
  /** Trade-program indicators, e.g. ["A+", "AU", "KR"] */
  programs: string[];
}

const UNITS: Record<string, RateUnit> = {
  kg: "kg",
  "clean kg": "kg",
  liter: "liter",
  liters: "liter",
  l: "liter",
  "pf. liter": "proof_liter",
  "pf liter": "proof_liter",
  "proof liter": "proof_liter",
  "doz.": "dozen",
  doz: "dozen",
  dozen: "dozen",
  "doz. pr.": "dozen_pairs",
  "doz. prs.": "dozen_pairs",
  "pr.": "pair",
  pr: "pair",
  pair: "pair",
  each: "each",
  "no.": "each",
  no: "each",
  head: "head",
  gross: "gross",
  m: "m",
  m2: "m2",
  "m²": "m2",
  m3: "m3",
  "m³": "m3",
  t: "ton",
  ton: "ton",
  "1000": "thousand",
  thousand: "thousand",
};

const NUMBER = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
const AD_VALOREM = new RegExp(String.raw`^${NUMBER}\s*%$`);
const SPECIFIC_CENTS = new RegExp(
  String.raw`^${NUMBER}\s*¢\s*(?:/\s*(.+)|\s+(each))$`,
);
const SPECIFIC_DOLLARS = new RegExp(
  String.raw`^\$\s*${NUMBER}\s*(?:/\s*(.+)|\s+(each))$`,
);

/** Normalise whitespace, strip trailing footnote markers ("Free 1/") and a final period. */
function clean(raw: string): string {
  return raw
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(\s*\d+\/)+$/, "")
    .replace(/\.$/, (dot, offset, s: string) =>
      // keep the period of abbreviations such as "doz." or "pr."
      /(doz|pr|prs|no|pf)\.$/i.test(s.slice(0, offset + 1)) ? dot : "",
    )
    .trim();
}

/** Shift a decimal string two places left: "2.4" → "0.024". Exact, no floats. */
export function centsToDollars(cents: string): string {
  const [whole, frac = ""] = cents.split(".");
  const digits = (whole.replace(/^0+/, "") || "0").padStart(3, "0") + frac;
  const point = digits.length - frac.length - 2;
  const result = `${digits.slice(0, point)}.${digits.slice(point)}`;
  return trimDecimal(result);
}

function trimDecimal(n: string): string {
  if (!n.includes(".")) return n.replace(/^0+(?=\d)/, "");
  const trimmed = n.replace(/0+$/, "").replace(/\.$/, "");
  const noLeadingZeros = trimmed.replace(/^0+(?=\d)/, "");
  if (!noLeadingZeros) return "0";
  return noLeadingZeros.startsWith(".") ? `0${noLeadingZeros}` : noLeadingZeros;
}

function parseComponent(part: string): RateComponent | string {
  const adValorem = AD_VALOREM.exec(part);
  if (adValorem)
    return { type: "ad_valorem", percent: trimDecimal(adValorem[1]) };

  const cents = SPECIFIC_CENTS.exec(part);
  const dollars = cents ? null : SPECIFIC_DOLLARS.exec(part);
  const match = cents ?? dollars;
  if (!match) return `unrecognised component "${part}"`;

  const unitText = (match[2] ?? match[3]).trim().toLowerCase();
  const unit = UNITS[unitText];
  if (!unit) return `unknown unit "${unitText}"`;

  const amount = cents ? centsToDollars(match[1]) : trimDecimal(match[1]);
  return { type: "specific", amountUsd: amount, unit };
}

/** Parse one rate, e.g. a General or Column 2 cell. */
export function parseRate(raw: string | null | undefined): ParsedRate {
  const text = clean(raw ?? "");
  if (!text) return { kind: "empty" };
  if (/^free$/i.test(text)) return { kind: "free" };

  const complex = (reason: string): ParsedRate => ({
    kind: "complex",
    raw: raw!.trim(),
    reason,
  });

  if (/[()]/.test(text)) return complex("contains parentheses");
  if (
    /\b(less|not|nor|but|on|minimum|maximum|plus|of|applicable|see)\b/i.test(
      text,
    )
  )
    return complex("conditional or qualified rate");

  const components: RateComponent[] = [];
  for (const part of text.split(/\s*\+\s*/)) {
    const parsed = parseComponent(part);
    if (typeof parsed === "string") return complex(parsed);
    components.push(parsed);
  }
  return { kind: "rate", components };
}

/**
 * Parse the Special column: one or more "rate (programs)" groups, e.g.
 * "Free (A+,AU,BH,CA) 2.8% (JP)".
 */
export function parseSpecialRates(
  raw: string | null | undefined,
): SpecialRate[] {
  const text = clean(raw ?? "");
  if (!text) return [];

  const groups: SpecialRate[] = [];
  const pattern = /([^()]+?)\s*\(([^()]*)\)/g;
  let consumed = 0;
  for (const match of text.matchAll(pattern)) {
    if (text.slice(consumed, match.index).trim()) {
      return [
        {
          rate: {
            kind: "complex",
            raw: text,
            reason: "unparsed special-rate text",
          },
          programs: [],
        },
      ];
    }
    const programs = match[2]
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    groups.push({ rate: parseRate(match[1]), programs });
    consumed = match.index! + match[0].length;
  }
  if (text.slice(consumed).trim()) {
    return [
      {
        rate: {
          kind: "complex",
          raw: text,
          reason: "unparsed special-rate text",
        },
        programs: [],
      },
    ];
  }
  return groups;
}

/** The special rate that applies to a program indicator, if any. */
export function specialRateFor(
  groups: SpecialRate[],
  program: string,
): ParsedRate | null {
  const wanted = program.trim().toUpperCase();
  for (const group of groups) {
    if (group.programs.some((p) => p.toUpperCase() === wanted))
      return group.rate;
  }
  return null;
}
