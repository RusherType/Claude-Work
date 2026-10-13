/** CD-024: the product page form, parsed into the columns a member may change. */
import { z } from "zod";
import { Decimal } from "@/lib/tariff/money";
import { factsSchema, MAX_MATERIALS, readFacts } from "./facts";
import {
  productFields,
  VALUE_CURRENCY_ISSUE,
  valueHasCurrency,
} from "./schema";

export const productEditSchema = z
  .strictObject({ ...productFields, facts: factsSchema })
  .refine(valueHasCurrency, VALUE_CURRENCY_ISSUE);
export type ProductEdit = z.infer<typeof productEditSchema>;

/** The form's text as the object productEditSchema expects. Blank means null (or empty list). */
export function formToProductEdit(form: FormData, missing?: string[]) {
  const get = (k: string) => {
    const v = form.get(k);
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t === "" ? null : t;
  };
  const list = (k: string, sep: RegExp) =>
    (get(k) ?? "")
      .split(sep)
      .map((s) => s.trim())
      .filter(Boolean);
  const value = get("customs_value");
  const materials = Array.from({ length: MAX_MATERIALS }, (_, i) => ({
    name: get(`material_${i}_name`),
    percent: get(`material_${i}_percent`),
  }))
    .filter((m) => m.name !== null || m.percent !== null)
    .map((m) => ({ name: m.name ?? "", percent: m.percent }));

  return {
    title: get("title") ?? "",
    description: get("description"),
    product_type: get("product_type"),
    vendor: get("vendor"),
    tags: list("tags", /[,;]/),
    image_urls: list("image_urls", /[\s,|]+/),
    origin_country: get("origin_country")?.toUpperCase() ?? null,
    customs_value: value,
    // The currency belongs to the value: without a value it is not stored.
    currency: value === null ? null : (get("currency")?.toUpperCase() ?? null),
    weight_kg: get("weight_kg"),
    facts: {
      materials,
      function: get("function"),
      user: get("user"),
      form: get("form"),
      ...(missing ? { missing } : {}),
    },
  };
}

/** Field errors keyed by form field name (materials map to their row). */
export function editErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const [first, second, third, fourth] = issue.path;
    let key = String(first ?? "form");
    if (
      first === "facts" &&
      second === "materials" &&
      typeof third === "number"
    ) {
      key = `material_${third}_${String(fourth ?? "name")}`;
    } else if (first === "facts") {
      key = String(second ?? "facts");
    }
    out[key] ??= issue.message;
  }
  return out;
}

/** A product row as stored (numeric columns read as text). */
export type StoredProduct = {
  title: string;
  description: string | null;
  product_type: string | null;
  vendor: string | null;
  tags: string[] | null;
  image_urls: string[] | null;
  origin_country: string | null;
  customs_value: string | null;
  currency: string | null;
  weight_kg: string | null;
  facts: unknown;
};

const sameNumber = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : new Decimal(a).equals(b);
const sameList = (a: string[] | null, b: string[]) =>
  JSON.stringify(a ?? []) === JSON.stringify(b);

/**
 * Only the columns the person actually changed. Saving rewrites nothing else, so an untouched
 * field stored in another form (facts `{}`, a currency with no value from the import) never
 * changes the content hash and never marks a confirmed code Outdated.
 */
export function changedColumns(
  edit: ProductEdit,
  stored: StoredProduct,
): Partial<ProductEdit> {
  const out: Partial<ProductEdit> = {};
  if (edit.title !== stored.title) out.title = edit.title;
  if (edit.description !== stored.description)
    out.description = edit.description;
  if (edit.product_type !== stored.product_type)
    out.product_type = edit.product_type;
  if (edit.vendor !== stored.vendor) out.vendor = edit.vendor;
  if (!sameList(stored.tags, edit.tags)) out.tags = edit.tags;
  if (!sameList(stored.image_urls, edit.image_urls))
    out.image_urls = edit.image_urls;
  if (edit.origin_country !== stored.origin_country)
    out.origin_country = edit.origin_country;
  if (!sameNumber(edit.weight_kg, stored.weight_kg))
    out.weight_kg = edit.weight_kg;
  // The currency only means something next to a value.
  if (
    !sameNumber(edit.customs_value, stored.customs_value) ||
    (edit.customs_value !== null && edit.currency !== stored.currency)
  ) {
    out.customs_value = edit.customs_value;
    if (edit.customs_value !== null) out.currency = edit.currency;
  }
  if (JSON.stringify(edit.facts) !== JSON.stringify(readFacts(stored.facts))) {
    out.facts = edit.facts;
  }
  return out;
}
