import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { pdfText, quotePdf } from "./pdf";
import type { SavedQuote } from "./saved";

const line = (title: string) => ({
  title,
  sku: "TEE-1",
  code: "6109100012",
  confirmed: true,
  quantity: 100,
  unitValue: "4.20",
  result: {
    id: "p1",
    status: "ok" as const,
    customsValueUsd: "420.00",
    components: [
      {
        kind: "duty_general" as const,
        label: "General duty",
        basis: "16.5% of $420.00",
        amount: "69.30",
      },
    ],
    dutyTotal: "69.30",
    allocatedFees: "2.69",
    landedCost: "491.99",
    warnings: [],
  },
});

const quote = (titles: string[]): SavedQuote => ({
  id: "q1",
  name: "November order",
  origin: "CN",
  mode: "express",
  entryDate: "2026-11-01",
  currency: "USD",
  fxRateToUsd: "1.00000000",
  carrier: null,
  createdAt: "2026-10-28T10:00:00Z",
  totals: {
    status: "ok",
    entryType: "informal",
    shipmentFees: [
      {
        kind: "mpf",
        label: "Merchandise processing fee (informal)",
        basis: "flat $2.69",
        amount: "2.69",
      },
    ],
    totals: {
      customsValue: "420.00",
      duties: "69.30",
      fees: "2.69",
      landedCost: "491.99",
    },
    warnings: [],
    notices: [],
  },
  lines: titles.map(line),
});

describe("pdfText", () => {
  it("keeps WinAnsi text and replaces the rest", () => {
    expect(pdfText("Crème brûlée – 100% “cotton” × 2 · €5")).toBe(
      "Crème brûlée – 100% “cotton” × 2 · €5",
    );
    expect(pdfText("कुर्ता 😀 T-shirt\nline")).toBe("?????? ? T-shirt line");
  });
});

describe("quotePdf", () => {
  it("writes a readable PDF, including non-Latin titles", async () => {
    const bytes = await quotePdf(quote(["कुर्ता cotton kurta"]), "Acme Ltd");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("Landed-cost quote: November order");
  });

  it("continues on new pages for long quotes", async () => {
    const bytes = await quotePdf(
      quote(Array.from({ length: 50 }, (_, i) => `Product ${i}`)),
      "Acme Ltd",
    );
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(3);
  });
});
