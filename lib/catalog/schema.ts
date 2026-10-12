/**
 * CD-022: the product row the import sends to the server, validated with the same schema in the
 * browser and in the server action. The database enforces the same limits (0003_catalog.sql).
 */
import { z } from "zod";
import { isCountryCode } from "@/lib/countries";
import { isCurrencyCode } from "./currencies";

export const MAX_ROWS = 5000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const BATCH_SIZE = 500;

/**
 * Control characters (C0 other than tab and line breaks, DEL, and C1 such as U+0085). Postgres
 * rejects NUL outright; the database checks reject the rest (0003_catalog.sql).
 */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
/** What the database's is_not_blank counts as blank, beyond JavaScript's \s. */
const BLANK = /[\s\u0085\u00a0\u2000-\u200b\u3000\ufeff]/g;
const isNotBlank = (s: string) => s.replace(BLANK, "") !== "";
/** Characters never allowed in an image link (spaces of any kind and controls). */
const URL_BAD = /[\s\u0000-\u001f\u007f-\u009f\u00a0\u2000-\u200b\u3000\ufeff]/;

export { isCurrencyCode } from "./currencies";

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !CONTROL.test(s), "contains control characters")
    .refine(isNotBlank, "is blank");

/** Plain decimal with at most `intDigits` before the point (matches the numeric column). */
export const decimalPattern = (intDigits: number, places: number) =>
  new RegExp(`^\\d{1,${intDigits}}(\\.\\d{1,${places}})?$`);

export const VALUE_DIGITS = { int: 10, places: 2 } as const; // numeric(12,2)
export const WEIGHT_DIGITS = { int: 7, places: 3 } as const; // numeric(10,3)

export const productRowSchema = z
  .strictObject({
    sku: text(100),
    title: text(500),
    description: text(20000).nullable(),
    product_type: text(200).nullable(),
    vendor: text(200).nullable(),
    tags: z.array(text(100)).max(250),
    image_urls: z
      .array(
        z
          .url({ protocol: /^https$/ })
          .max(2000)
          .refine((s) => !URL_BAD.test(s)),
      )
      .max(20),
    origin_country: z
      .string()
      .refine(isCountryCode, "unknown country")
      .nullable(),
    customs_value: z
      .string()
      .regex(decimalPattern(VALUE_DIGITS.int, VALUE_DIGITS.places))
      .nullable(),
    currency: z.string().refine(isCurrencyCode, "unknown currency").nullable(),
    weight_kg: z
      .string()
      .regex(decimalPattern(WEIGHT_DIGITS.int, WEIGHT_DIGITS.places))
      .nullable(),
  })
  // A value is meaningless without its currency, and a currency alone would re-label a stored value.
  .refine((r) => (r.customs_value === null) === (r.currency === null), {
    path: ["currency"],
    message: "a customs value and its currency go together",
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
