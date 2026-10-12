/** CD-022: the fields a CSV can fill, the template, and how file columns map to fields. */

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
    help: "Three-letter code of the customs value, e.g. USD. Blank uses the currency you pick for the file.",
    example: "USD",
  },
  weight_kg: {
    label: "Weight (kg)",
    help: "Net weight per unit in kilograms.",
    example: "0.18",
  },
};

/**
 * Header names we recognise for each field, compared lowercase with spaces and symbols removed.
 * Weight is matched only when the header says kg: a bare "Weight" is often pounds.
 */
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
  weight_kg: ["weightkg", "netweightkg", "weightinkg", "kg"],
};

export const normalizeHeader = (h: string) =>
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
 * Shopify product exports have one row per variant and per extra image, grouped by Handle. Only
 * the first row of a product carries its title, description and so on.
 */
export type ShopifyColumns = { handle: number; options: number[] };

export function shopifyColumns(headers: string[]): ShopifyColumns | null {
  const normalized = headers.map(normalizeHeader);
  const handle = normalized.indexOf("handle");
  if (handle < 0) return null;
  const options = ["option1value", "option2value", "option3value"]
    .map((h) => normalized.indexOf(h))
    .filter((i) => i >= 0);
  return { handle, options };
}

export function templateRows(): string[][] {
  return [FIELDS.map((f) => f), FIELDS.map((f) => FIELD_INFO[f].example)];
}
