/**
 * CSV product import (CD-022): the template, column mapping and per-row validation. Shared by the
 * browser (preview and errors before upload) and the server action (which re-validates every
 * batch with `importBatchSchema`).
 */
import { z } from "zod";
import { COUNTRIES, isCountryCode } from "@/lib/countries";

export const MAX_ROWS = 5000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const BATCH_SIZE = 500;

export const FIELDS = [
  "sku",
  "title",
  "description",
  "product_type",
  "vendor",
  "tags",
  "image_urls",
  "origin_country",
  "customs_value",
  "currency",
  "weight_kg",
] as const;
export type Field = (typeof FIELDS)[number];

export const FIELD_INFO: Record<
  Field,
  { label: string; required?: boolean; help: string; example: string }
> = {
  sku: {
    label: "SKU",
    required: true,
    help: "Your unique product code. Re-importing a SKU updates that product.",
    example: "TEE-CREW-BLK-M",
  },
  title: {
    label: "Title",
    required: true,
    help: "Product name.",
    example: "Men's crew-neck T-shirt",
  },
  description: {
    label: "Description",
    help: "What it is, what it's made of, what it's for.",
    example: "100% cotton knit T-shirt, short sleeves",
  },
  product_type: {
    label: "Product type",
    help: "Your category.",
    example: "T-shirts",
  },
  vendor: { label: "Vendor", help: "Brand or maker.", example: "Acme Apparel" },
  tags: {
    label: "Tags",
    help: "Separated by commas or semicolons.",
    example: "cotton, menswear",
  },
  image_urls: {
    label: "Image URLs",
    help: "https links, separated by spaces, commas or |.",
    example: "https://example.com/tee.jpg",
  },
  origin_country: {
    label: "Country of origin",
    help: "Where it was made: a two-letter code (CN) or the English name.",
    example: "CN",
  },
  customs_value: {
    label: "Customs value",
    help: "What you paid per unit, e.g. 4.20.",
    example: "4.20",
  },
  currency: {
    label: "Currency",
    help: "Three letters, e.g. USD. Blank means USD for new products.",
    example: "USD",
  },
  weight_kg: {
    label: "Weight (kg)",
    help: "Net weight per unit in kilograms.",
    example: "0.18",
  },
};

/** Header names we recognise for each field, compared lowercase with spaces and symbols removed. */
const SYNONYMS: Record<Field, string[]> = {
  sku: ["sku", "variantsku", "itemsku", "productsku", "skucode"],
  title: ["title", "name", "productname", "producttitle", "itemname"],
  description: [
    "description",
    "body",
    "bodyhtml",
    "productdescription",
    "details",
  ],
  product_type: ["producttype", "type", "category", "productcategory"],
  vendor: ["vendor", "brand", "manufacturer", "maker"],
  tags: ["tags", "keywords"],
  image_urls: ["imageurls", "imageurl", "imagesrc", "images", "image"],
  origin_country: [
    "origincountry",
    "countryoforigin",
    "origin",
    "coo",
    "madein",
  ],
  customs_value: [
    "customsvalue",
    "unitvalue",
    "costperitem",
    "unitcost",
    "cost",
  ],
  currency: ["currency", "currencycode"],
  weight_kg: ["weightkg", "weight", "netweightkg", "netweight"],
};

const normalizeHeader = (h: string) =>
  h.toLowerCase().replace(/[^a-z0-9]/g, "");

export type Mapping = Partial<Record<Field, number>>;

/** Best guess of which column holds each field; each column is used at most once. */
export function guessMapping(headers: string[]): Mapping {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: Mapping = {};
  for (const field of FIELDS) {
    for (const synonym of SYNONYMS[field]) {
      const index = normalized.findIndex(
        (h, i) => h === synonym && !used.has(i),
      );
      if (index >= 0) {
        mapping[field] = index;
        used.add(index);
        break;
      }
    }
  }
  return mapping;
}

export function templateRows(): string[][] {
  return [FIELDS.map((f) => f), FIELDS.map((f) => FIELD_INFO[f].example)];
}

// ------------------------------------------------------------------ the row sent to the server

const text = (max: number) => z.string().trim().min(1).max(max);
const decimal = (places: number) =>
  z
    .string()
    .regex(new RegExp(`^\\d{1,10}(\\.\\d{1,${places}})?$`), "must be a number");

export const productRowSchema = z.strictObject({
  sku: text(100),
  title: text(500),
  description: text(20000).nullable(),
  product_type: text(200).nullable(),
  vendor: text(200).nullable(),
  tags: z.array(text(100)).max(250),
  image_urls: z.array(z.url({ protocol: /^https$/ }).max(2000)).max(20),
  origin_country: z
    .string()
    .refine(isCountryCode, "unknown country")
    .nullable(),
  customs_value: decimal(2).nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  weight_kg: decimal(3).nullable(),
});
export type ProductRow = z.infer<typeof productRowSchema>;

export const importBatchSchema = z.strictObject({
  workspaceId: z.uuid(),
  rows: z
    .array(productRowSchema)
    .min(1)
    .max(BATCH_SIZE)
    .refine(
      (rows) => new Set(rows.map((r) => r.sku)).size === rows.length,
      "duplicate SKU in batch",
    ),
});

// ------------------------------------------------------------------ cell parsing

export type RowError = { field: Field | null; message: string };
export type CheckedRow = {
  /** Line number in the file, counting the header as line 1. */
  line: number;
  row: ProductRow | null;
  errors: RowError[];
};

const COUNTRY_BY_NAME = new Map(
  COUNTRIES.map((c) => [c.name.toLowerCase(), c.code]),
);

function parseCountry(cell: string): string | null {
  const upper = cell.toUpperCase();
  if (isCountryCode(upper)) return upper;
  return COUNTRY_BY_NAME.get(cell.toLowerCase()) ?? null;
}

/** "$1,234.50" -> "1234.50". Rejects decimal commas ("12,50"), which are ambiguous. */
function parseAmount(cell: string, places: number): string | null {
  let s = cell.replace(/^\$\s*/, "").replace(/\s+/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  return new RegExp(`^\\d{1,10}(\\.\\d{1,${places}})?$`).test(s) ? s : null;
}

const splitList = (cell: string, separators: RegExp) =>
  cell
    .split(separators)
    .map((s) => s.trim())
    .filter(Boolean);

/** Turn one CSV row into a product, or say what is wrong with each cell. */
export function checkRow(
  cells: string[],
  mapping: Mapping,
  line: number,
): CheckedRow {
  const errors: RowError[] = [];
  const get = (field: Field) => {
    const index = mapping[field];
    const value = index === undefined ? "" : (cells[index] ?? "").trim();
    return value === "" ? null : value;
  };
  const fail = (field: Field, message: string) => {
    errors.push({ field, message: `${FIELD_INFO[field].label}: ${message}` });
    return null;
  };

  const sku = get("sku") ?? fail("sku", "required");
  const title = get("title") ?? fail("title", "required");

  const originCell = get("origin_country");
  const origin_country = originCell
    ? (parseCountry(originCell) ??
      fail("origin_country", `"${originCell}" is not a country we know`))
    : null;

  const valueCell = get("customs_value");
  const customs_value = valueCell
    ? (parseAmount(valueCell, 2) ??
      fail(
        "customs_value",
        `"${valueCell}" is not an amount like 4.20 (use a dot for decimals)`,
      ))
    : null;

  const weightCell = get("weight_kg");
  const weight_kg = weightCell
    ? (parseAmount(weightCell, 3) ??
      fail(
        "weight_kg",
        `"${weightCell}" is not a weight like 0.25 (up to 3 decimals)`,
      ))
    : null;

  const currencyCell = get("currency");
  const currency = currencyCell
    ? /^[A-Za-z]{3}$/.test(currencyCell)
      ? currencyCell.toUpperCase()
      : fail("currency", `"${currencyCell}" is not a 3-letter code like USD`)
    : null;

  const tags = splitList(get("tags") ?? "", /[,;]/);
  const image_urls = splitList(get("image_urls") ?? "", /[\s,|]+/);

  const candidate = {
    sku,
    title,
    description: get("description"),
    product_type: get("product_type"),
    vendor: get("vendor"),
    tags,
    image_urls,
    origin_country,
    customs_value,
    currency,
    weight_kg,
  };
  if (errors.length > 0) return { line, row: null, errors };

  const parsed = productRowSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as Field;
      errors.push({
        field,
        message: `${FIELD_INFO[field]?.label ?? String(field)}: ${issueMessage(field, issue)}`,
      });
    }
    return { line, row: null, errors };
  }
  return { line, row: parsed.data, errors };
}

function issueMessage(field: Field, issue: z.core.$ZodIssue): string {
  if (field === "image_urls")
    return "each image must be an https link (at most 20)";
  if (field === "tags") return "at most 250 tags of up to 100 characters";
  if (issue.code === "too_big") return "too long";
  return issue.message;
}

/** Check every data row; later rows repeating a SKU are errors. */
export function checkRows(rows: string[][], mapping: Mapping): CheckedRow[] {
  const firstLine = new Map<string, number>();
  return rows.map((cells, i) => {
    const checked = checkRow(cells, mapping, i + 2);
    const sku = checked.row?.sku;
    if (sku !== undefined) {
      const seen = firstLine.get(sku);
      if (seen !== undefined) {
        return {
          line: checked.line,
          row: null,
          errors: [{ field: "sku", message: `SKU: same SKU as line ${seen}` }],
        };
      }
      firstLine.set(sku, checked.line);
    }
    return checked;
  });
}

/** Problems with the mapping itself, before any row is checked. */
export function mappingProblems(mapping: Mapping): string[] {
  const problems = FIELDS.filter(
    (f) => FIELD_INFO[f].required && mapping[f] === undefined,
  ).map((f) => `Choose the column that holds ${FIELD_INFO[f].label}.`);
  const columns = Object.values(mapping);
  if (new Set(columns).size !== columns.length) {
    problems.push("Each column can be used for one field only.");
  }
  return problems;
}

/**
 * Split checked rows into upload batches of at most `maxRows` rows and about `maxBytes` of JSON,
 * so each server action stays under the 1 MB request limit.
 */
export function planBatches(
  rows: ProductRow[],
  maxRows = BATCH_SIZE,
  maxBytes = 700_000,
): ProductRow[][] {
  const batches: ProductRow[][] = [];
  let current: ProductRow[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = new TextEncoder().encode(JSON.stringify(row)).length + 1;
    if (
      current.length > 0 &&
      (current.length >= maxRows || bytes + size > maxBytes)
    ) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(row);
    bytes += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
