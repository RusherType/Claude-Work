/** CD-022: turn CSV rows into product rows, with a plain-words problem for every bad cell. */
import type { z } from "zod";
import { COUNTRIES, isCountryCode } from "@/lib/countries";
import type { CsvRow } from "./csv";
import {
  FIELD_INFO,
  type Field,
  type Mapping,
  type ShopifyColumns,
} from "./fields";
import {
  decimalPattern,
  isCurrencyCode,
  productRowSchema,
  VALUE_DIGITS,
  WEIGHT_DIGITS,
  type ProductRow,
} from "./schema";

export type RowError = { field: Field | null; message: string };
export type CheckedRow = {
  /** Line in the file where the row starts. */
  line: number;
  /** The row's cells as they were in the file. */
  cells: string[];
  row: ProductRow | null;
  errors: RowError[];
};
export type CheckOptions = {
  /** Currency of customs values in rows without their own currency. */
  currency?: string;
  shopify?: ShopifyColumns | null;
};
export type CheckResult = {
  checked: CheckedRow[];
  /** All-blank rows (often trailing rows from a spreadsheet), ignored. */
  blank: number;
  /** Shopify image-only rows merged into their product. */
  merged: number;
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
function parseAmount(
  cell: string,
  digits: { int: number; places: number },
): string | null {
  let s = cell.replace(/^\$\s*/, "").replace(/\s+/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  return decimalPattern(digits.int, digits.places).test(s) ? s : null;
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
  options: CheckOptions = {},
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
    ? (parseAmount(valueCell, VALUE_DIGITS) ??
      fail(
        "customs_value",
        `"${valueCell}" is not an amount like 4.20 (use a dot for decimals, at most 10 digits before it)`,
      ))
    : null;

  const weightCell = get("weight_kg");
  const weight_kg = weightCell
    ? (parseAmount(weightCell, WEIGHT_DIGITS) ??
      fail(
        "weight_kg",
        `"${weightCell}" is not a weight in kg like 0.25 (up to 3 decimals, under 10,000,000)`,
      ))
    : null;

  // The currency belongs to the value: without a value it is ignored.
  const currencyCell = get("currency")?.toUpperCase() ?? null;
  let currency: string | null = null;
  if (valueCell) {
    const code = currencyCell ?? options.currency ?? null;
    if (code === null)
      currency = fail("currency", "required with a customs value");
    else if (!isCurrencyCode(code))
      currency = fail("currency", `"${code}" is not a currency code like USD`);
    else currency = code;
  }

  const candidate = {
    sku,
    title,
    description: get("description"),
    product_type: get("product_type"),
    vendor: get("vendor"),
    tags: splitList(get("tags") ?? "", /[,;]/),
    image_urls: splitList(get("image_urls") ?? "", /[\s,|]+/),
    origin_country,
    customs_value,
    currency,
    weight_kg,
  };
  if (errors.length > 0) return { line, cells, row: null, errors };

  const parsed = productRowSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as Field;
      errors.push({
        field,
        message: `${FIELD_INFO[field]?.label ?? String(field)}: ${issueMessage(field, issue)}`,
      });
    }
    return { line, cells, row: null, errors };
  }
  return { line, cells, row: parsed.data, errors };
}

function issueMessage(field: Field, issue: z.core.$ZodIssue): string {
  if (
    issue.message === "contains control characters" ||
    issue.message === "is blank"
  ) {
    return field === "tags" ? `a tag ${issue.message}` : issue.message;
  }
  if (field === "image_urls")
    return "each image must be an https link (at most 20)";
  if (field === "tags") return "at most 250 tags of up to 100 characters";
  if (issue.code === "too_big") return "too long";
  return issue.message;
}

/**
 * Check every data row. All-blank rows are ignored. Later rows repeating a SKU are errors. In a
 * Shopify export, variant rows take the product's details from its first row, and image-only rows
 * add their image to the product.
 */
export function checkRows(
  rows: CsvRow[],
  mapping: Mapping,
  options: CheckOptions = {},
): CheckResult {
  const nonBlank = rows.filter((r) => r.cells.some((c) => c.trim() !== ""));
  const { rows: prepared, merged } = options.shopify
    ? groupShopify(nonBlank, mapping, options.shopify)
    : { rows: nonBlank, merged: 0 };

  const firstLine = new Map<string, number>();
  const checked = prepared.map(({ line, cells }) => {
    const result = checkRow(cells, mapping, line, options);
    const sku = result.row?.sku;
    if (sku !== undefined) {
      const seen = firstLine.get(sku);
      if (seen !== undefined) {
        return {
          ...result,
          row: null,
          errors: [
            { field: "sku" as const, message: `SKU: same SKU as line ${seen}` },
          ],
        };
      }
      firstLine.set(sku, line);
    }
    return result;
  });
  return { checked, blank: rows.length - nonBlank.length, merged };
}

const PRODUCT_LEVEL: Field[] = [
  "title",
  "description",
  "product_type",
  "vendor",
  "tags",
  "origin_country",
];

function groupShopify(
  rows: CsvRow[],
  mapping: Mapping,
  shopify: ShopifyColumns,
): { rows: CsvRow[]; merged: number } {
  const cell = (r: CsvRow, i: number | undefined) =>
    i === undefined ? "" : (r.cells[i] ?? "").trim();
  const groups = new Map<string, CsvRow[]>();
  for (const r of rows) {
    const handle = cell(r, shopify.handle);
    if (!handle) continue;
    const group = groups.get(handle);
    if (group) group.push(r);
    else groups.set(handle, [r]);
  }

  const options = (r: CsvRow) =>
    shopify.options
      .map((i) => cell(r, i))
      .filter((v) => v && v !== "Default Title");
  // A row with no SKU, title or options is an image row (its image, if any, joins the product).
  // A variant without a SKU has options or a title, so it stays and is reported, never dropped.
  const imageOnly = (r: CsvRow) =>
    !cell(r, mapping.sku) && !cell(r, mapping.title) && options(r).length === 0;

  let merged = 0;
  const out: CsvRow[] = [];
  for (const r of rows) {
    const group = groups.get(cell(r, shopify.handle));
    if (!group) {
      out.push(r);
      continue;
    }
    if (imageOnly(r) && group.some((g) => !imageOnly(g))) {
      merged++; // its image is added to the product's variants below
      continue;
    }
    const first = group[0];
    const cells = [...r.cells];
    for (const field of PRODUCT_LEVEL) {
      const i = mapping[field];
      if (i !== undefined && !cell(r, i)) cells[i] = first.cells[i] ?? "";
    }
    // "Tee" + options M -> "Tee (M)", unless the title already says so (a re-imported download).
    const titleIndex = mapping.title;
    const opts = options(r);
    if (titleIndex !== undefined && opts.length > 0 && cells[titleIndex]) {
      const suffix = ` (${opts.join(" / ")})`;
      const title = cells[titleIndex].trim();
      cells[titleIndex] = title.endsWith(suffix) ? title : title + suffix;
    }
    // The row's own image first, then the product's other images.
    const imageIndex = mapping.image_urls;
    if (imageIndex !== undefined) {
      const own = cell(r, imageIndex)
        .split(/[\s,|]+/)
        .filter(Boolean);
      const all = group.flatMap((g) =>
        cell(g, imageIndex)
          .split(/[\s,|]+/)
          .filter(Boolean),
      );
      cells[imageIndex] = [...new Set([...own, ...all])].slice(0, 20).join(" ");
    }
    out.push({ line: r.line, cells });
  }
  return { rows: out, merged };
}
