/**
 * CD-051: what the calculator sends to the server. The server loads codes, rates, fees and
 * programs itself; only the person's choices come from the form.
 */
import { z } from "zod";
import { text } from "@/lib/catalog/schema";
import { isCurrencyCode } from "@/lib/catalog/currencies";
import { isCountryCode } from "@/lib/countries";
import { MODES, type Mode } from "@/lib/tariff/landed-cost/types";
import { Decimal } from "@/lib/tariff/money";

export const MAX_QUOTE_LINES = 50;

/** numeric(12,2): what one unit is worth, in the quote currency. */
const unitValue = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "A value like 4.20.");

/** numeric(18,8): US dollars for one unit of the quote currency, as published by the source used. */
const fxRate = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,8})?$/, "A rate like 0.0119.")
  .refine((s) => new Decimal(s).gt(0), "Must be more than 0.");

export const quoteLineSchema = z.object({
  productId: z.uuid(),
  quantity: z.coerce
    .number()
    .int("Whole items only.")
    .min(1, "At least 1.")
    .max(1_000_000, "At most 1,000,000."),
  unitValue,
});

export const quoteInputSchema = z
  .object({
    lines: z
      .array(quoteLineSchema)
      .min(1, "Add at least one product.")
      .max(MAX_QUOTE_LINES, `At most ${MAX_QUOTE_LINES} products per quote.`),
    origin: z.string().refine(isCountryCode, "Choose a country of origin."),
    mode: z.enum(MODES as [Mode, ...Mode[]], "Choose how it ships."),
    entryDate: z.iso.date("Use a date like 2026-11-01."),
    currency: z.string().refine(isCurrencyCode, "Choose a currency."),
    fxRateToUsd: fxRate,
    carrier: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? null : v),
      text(60).nullable(),
    ),
  })
  .refine((q) => q.currency !== "USD" || new Decimal(q.fxRateToUsd).eq(1), {
    path: ["fxRateToUsd"],
    message: "US dollars convert at 1.",
  })
  .refine(
    (q) => new Set(q.lines.map((l) => l.productId)).size === q.lines.length,
    {
      path: ["lines"],
      message: "Each product once; change its quantity instead.",
    },
  );
export type QuoteInput = z.infer<typeof quoteInputSchema>;

export const saveQuoteSchema = z.object({
  name: text(120),
  input: quoteInputSchema,
});
