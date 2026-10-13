/** CD-024: the product page form, parsed into the columns a member may change. */
import { z } from "zod";
import { factsSchema, MAX_MATERIALS } from "./facts";
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
