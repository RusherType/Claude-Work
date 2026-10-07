/**
 * Parser for HTSUS rate-of-duty text ("Free", "5.3%", "2.4¢/kg", "25¢/kg + 3.4%", ...).
 *
 * The parser only turns text into data; it never computes duty (that is the landed-cost engine,
 * CD-050). Numbers stay as exact decimal strings, never floats: percentages as written ("5.3"),
 * specific amounts converted to US dollars ("2.4¢" -> "0.024"). Anything the parser cannot read
 * with certainty is returned as `complex` with the original text, so the engine refuses to guess.
 */

export type Unit =
  | "kg"
  | "g"
  | "t"
  | "liter"
  | "proof_liter"
  | "each"
  | "pair"
  | "dozen"
  | "dozen_pairs"
  | "gross"
  | "thousand"
  | "m"
  | "m2"
  | "m3"
  | "head"
  | "carat"
  | "barrel"
  | "clean_kg";

export type RateComponent =
  | { kind: "ad_valorem"; percent: string }
  | { kind: "specific"; usd: string; unit: Unit };

export type ParsedRate =
  /** Blank cell: no rate on this line (headings, or a column that does not apply). */
  | { type: "none" }
  | { type: "free" }
  /** Duty is the sum of the components. `basis` qualifies the quantity, e.g. "on drained weight". */
  | { type: "rate"; components: RateComponent[]; basis?: string }
  /** Text the parser cannot read safely (conditions, "less ... for each degree", references). */
  | { type: "complex"; raw: string };

export type SpecialRate = { rate: ParsedRate; programs: string[] };

const UNITS: Record<string, Unit> = {
  kg: "kg",
  g: "g",
  t: "t",
  liter: "liter",
  l: "liter",
  "proof liter": "proof_liter",
  "pf. liter": "proof_liter",
  "pf.liter": "proof_liter",
  each: "each",
  no: "each",
  pr: "pair",
  doz: "dozen",
  "doz. pr": "dozen_pairs",
  "doz.pr": "dozen_pairs",
  gross: "gross",
  thousand: "thousand",
  "1000": "thousand",
  m: "m",
  "m²": "m2",
  m2: "m2",
  "m³": "m3",
  m3: "m3",
  head: "head",
  carat: "carat",
  bbl: "barrel",
  barrel: "barrel",
  "clean kg": "clean_kg",
};

// Qualifiers that change which quantity is measured but keep the rate itself readable.
const BASES = [
  "on drained weight",
  "on contents and container",
  "on the entire contents of the container",
  "on entire contents of container",
];

const NUMBER = String.raw`(\d+(?:\.\d+)?|\.\d+)`;

/** "05.30" -> "5.3", ".5" -> "0.5". Input must already be a plain decimal string. */
export function normalizeDecimal(s: string): string {
  let [int, frac = ""] = s.split(".");
  int = int.replace(/^0+(?=\d)/, "") || "0";
  frac = frac.replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

/** Exact division by 100 on a decimal string: cents -> dollars. "2.4" -> "0.024". */
export function centsToUsd(cents: string): string {
  const [int, frac = ""] = normalizeDecimal(cents).split(".");
  const padded = int.padStart(3, "0");
  return normalizeDecimal(`${padded.slice(0, -2)}.${padded.slice(-2)}${frac}`);
}

function clean(raw: string): string {
  return raw
    .replace(/[   ]/g, " ")
    .replace(/(?<!m)[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, "") // footnote marks; keep m² and m³
    .replace(/\s+/g, " ")
    .trim();
}

function parseUnit(text: string): Unit | null {
  const key = text.trim().toLowerCase().replace(/\.$/, "").replace(/\s+/g, " ");
  return UNITS[key] ?? null;
}

function parseComponent(part: string): RateComponent | null {
  const pct = new RegExp(String.raw`^${NUMBER}\s*%$`).exec(part);
  if (pct) return { kind: "ad_valorem", percent: normalizeDecimal(pct[1]) };

  const cents = new RegExp(String.raw`^${NUMBER}\s*¢\s*/\s*(.+)$`).exec(part);
  if (cents) {
    const unit = parseUnit(cents[2]);
    return unit ? { kind: "specific", usd: centsToUsd(cents[1]), unit } : null;
  }

  const dollars = new RegExp(String.raw`^\$\s*${NUMBER}\s*/\s*(.+)$`).exec(
    part,
  );
  if (dollars) {
    const unit = parseUnit(dollars[2]);
    return unit
      ? { kind: "specific", usd: normalizeDecimal(dollars[1]), unit }
      : null;
  }

  const each = new RegExp(
    String.raw`^(?:\$\s*${NUMBER}|${NUMBER}\s*¢)\s+each$`,
  ).exec(part);
  if (each) {
    const usd =
      each[1] !== undefined ? normalizeDecimal(each[1]) : centsToUsd(each[2]);
    return { kind: "specific", usd, unit: "each" };
  }
  return null;
}

/** Parse one rate cell from the General or Column 2 column. */
export function parseRate(raw: string | null | undefined): ParsedRate {
  if (raw == null) return { type: "none" };
  const text = clean(raw);
  if (text === "") return { type: "none" };
  if (/^free$/i.test(text)) return { type: "free" };

  let body = text;
  let basis: string | undefined;
  for (const b of BASES) {
    if (body.toLowerCase().endsWith(` ${b}`)) {
      basis = b;
      body = body.slice(0, -b.length - 1).trim();
      break;
    }
  }

  const parts = body.split(/\s*\+\s*/);
  const components: RateComponent[] = [];
  for (const part of parts) {
    const c = parseComponent(part);
    if (!c) return { type: "complex", raw: text };
    components.push(c);
  }
  if (components.filter((c) => c.kind === "ad_valorem").length > 1) {
    return { type: "complex", raw: text };
  }
  return basis
    ? { type: "rate", components, basis }
    : { type: "rate", components };
}

/**
 * Parse the Special column: one or more "<rate> (<program codes>)" groups, e.g.
 * "Free (A+,AU,BH,CL) 2.1% (JP)". Returns null when the text does not fit that shape.
 */
export function parseSpecialRates(
  raw: string | null | undefined,
): SpecialRate[] | null {
  if (raw == null) return [];
  const text = clean(raw);
  if (text === "") return [];
  const group = /\s*([^()]+?)\s*\(([^()]+)\)/y;
  const out: SpecialRate[] = [];
  let m: RegExpExecArray | null;
  while ((m = group.exec(text))) {
    const programs = m[2]
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (programs.length === 0) return null;
    out.push({ rate: parseRate(m[1]), programs });
    if (group.lastIndex === text.length) return out;
  }
  return null;
}
