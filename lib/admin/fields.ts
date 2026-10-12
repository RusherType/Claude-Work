/** CD-014: how each reference table is shown and edited in Admin. */
import { normalizeDecimal } from "@/lib/tariff/rate";
import { FEE_TYPES, MODES, RATE_TYPES, type Entity } from "./schemas";

export type FieldKind =
  | "text"
  | "textarea"
  | "date"
  | "url"
  | "select"
  | "modes"
  | "checkbox"
  | "exempt";
export type FormField = {
  name: string;
  label: string;
  kind: FieldKind;
  help?: string;
  required?: boolean;
  options?: readonly { value: string; label: string }[];
  placeholder?: string;
};

export const ENTITY_INFO: Record<
  Entity,
  { title: string; singular: string; intro: string }
> = {
  measures: {
    title: "Tariff measures",
    singular: "measure",
    intro:
      "Chapter 99 overlays (Sections 232, 301, 338 and others). Published measures apply to every customer's landed cost from their start date.",
  },
  fees: {
    title: "Fees",
    singular: "fee",
    intro:
      "Merchandise processing fee, harbor maintenance fee, carrier brokerage and the informal entry limit, by date.",
  },
  programs: {
    title: "Special programs",
    singular: "program",
    intro:
      "Who may claim each Special-column program (HTSUS General Notes) and whether its goods skip the MPF.",
  },
};

const DATES: FormField[] = [
  {
    name: "effective_from",
    label: "Effective from",
    kind: "date",
    required: true,
  },
  {
    name: "effective_to",
    label: "Effective to",
    kind: "date",
    help: "Last day it applies. Leave blank if open-ended.",
  },
  {
    name: "source_url",
    label: "Source",
    kind: "url",
    required: true,
    help: "Federal Register, CSMS or USITC link that proves this row.",
  },
  { name: "notes", label: "Notes", kind: "textarea" },
];

const options = (
  values: readonly string[],
  labels: Record<string, string> = {},
) => values.map((v) => ({ value: v, label: labels[v] ?? v }));

export const FORM_FIELDS: Record<Entity, FormField[]> = {
  measures: [
    {
      name: "authority",
      label: "Authority",
      kind: "text",
      required: true,
      placeholder: "Section 301",
    },
    {
      name: "ch99_code",
      label: "Chapter 99 code",
      kind: "text",
      placeholder: "9903.88.03",
    },
    {
      name: "hts_prefixes",
      label: "HTS prefixes covered",
      kind: "textarea",
      required: true,
      help: "Separated by commas, spaces or new lines, e.g. 6109 6110.20.",
    },
    { name: "excluded_prefixes", label: "Excluded prefixes", kind: "textarea" },
    {
      name: "origin_countries",
      label: "Origins",
      kind: "text",
      required: true,
      help: "Two-letter codes (CN HK), or ** for every origin.",
    },
    {
      name: "rate_type",
      label: "Rate type",
      kind: "select",
      required: true,
      options: options(RATE_TYPES, {
        ad_valorem: "Percent of value",
        flat_per_item: "US dollars per item",
        specific: "Specific (needs review in the engine)",
      }),
    },
    {
      name: "rate_value",
      label: "Rate",
      kind: "text",
      required: true,
      help: "25 means 25% (or $25 per item).",
    },
    { name: "applies_to_modes", label: "Shipping modes", kind: "modes" },
    { name: "exempt_programs", label: "Exempt programs", kind: "exempt" },
    ...DATES,
  ],
  fees: [
    {
      name: "fee_type",
      label: "Fee",
      kind: "select",
      required: true,
      options: options(FEE_TYPES, {
        mpf_formal: "MPF, formal entry",
        mpf_informal: "MPF, informal entry",
        hmf: "Harbor maintenance fee",
        carrier_brokerage: "Carrier brokerage",
        informal_entry_limit: "Informal entry limit",
      }),
    },
    {
      name: "mode",
      label: "Mode",
      kind: "select",
      options: [{ value: "", label: "Any mode" }, ...options(MODES)],
    },
    {
      name: "carrier",
      label: "Carrier",
      kind: "text",
      help: "Leave blank for every carrier.",
    },
    {
      name: "pct",
      label: "Percentage",
      kind: "text",
      help: "0.3464 means 0.3464% of value.",
    },
    {
      name: "flat_amount",
      label: "Flat amount (USD)",
      kind: "text",
      help: "For the informal entry limit, the limit itself.",
    },
    { name: "min_amount", label: "Minimum (USD)", kind: "text" },
    { name: "max_amount", label: "Maximum (USD)", kind: "text" },
    ...DATES,
  ],
  programs: [
    {
      name: "symbol",
      label: "Symbol",
      kind: "text",
      required: true,
      placeholder: "S",
    },
    {
      name: "name",
      label: "Name",
      kind: "text",
      required: true,
      placeholder: "USMCA",
    },
    {
      name: "countries",
      label: "Eligible countries",
      kind: "textarea",
      required: true,
      help: "Two-letter codes separated by commas or spaces.",
    },
    {
      name: "mpf_exempt",
      label: "Qualifying goods skip the merchandise processing fee",
      kind: "checkbox",
    },
    ...DATES,
  ],
};

export { MODES };

/** The value a form field shows for a stored row. */
export function formValue(
  row: Record<string, unknown> | null,
  name: string,
): string {
  const v = row?.[name];
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(" ");
  return String(v);
}

export type RowStatus = "Draft" | "Published" | "Ended";
export function rowStatus(
  row: { published: boolean; effective_to: string | null },
  today: string,
): RowStatus {
  if (!row.published) return "Draft";
  return row.effective_to !== null && row.effective_to < today
    ? "Ended"
    : "Published";
}

/** Short summary columns for the list pages. */
export function summary(
  entity: Entity,
  r: Record<string, unknown>,
): [string, string][] {
  const list = (v: unknown, n = 3) => {
    const a = (v as string[] | null) ?? [];
    return a.length <= n
      ? a.join(" ")
      : `${a.slice(0, n).join(" ")} +${a.length - n}`;
  };
  switch (entity) {
    case "measures":
      return [
        ["Measure", [r.authority, r.ch99_code].filter(Boolean).join(" · ")],
        ["Covers", list(r.hts_prefixes)],
        ["Origins", list(r.origin_countries)],
        [
          "Rate",
          r.rate_type === "ad_valorem"
            ? `${normalizeDecimal(String(r.rate_value))}%`
            : r.rate_type === "flat_per_item"
              ? `$${r.rate_value} per item`
              : `${r.rate_value} (specific)`,
        ],
      ];
    case "fees":
      return [
        ["Fee", String(r.fee_type)],
        [
          "Applies to",
          [r.mode ?? "any mode", r.carrier].filter(Boolean).join(" · "),
        ],
        [
          "Amount",
          [
            r.pct !== null ? `${r.pct}%` : null,
            r.flat_amount !== null ? `$${r.flat_amount}` : null,
            r.min_amount !== null ? `min $${r.min_amount}` : null,
            r.max_amount !== null ? `max $${r.max_amount}` : null,
          ]
            .filter(Boolean)
            .join(", "),
        ],
      ];
    case "programs":
      return [
        ["Program", `${r.symbol} · ${r.name}`],
        ["Countries", list(r.countries, 5)],
        ["MPF", r.mpf_exempt ? "Exempt" : "Charged"],
      ];
  }
}
