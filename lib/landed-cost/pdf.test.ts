import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  MAX_PDF_ROWS,
  pdfRows,
  pdfText,
  QuoteTooLongError,
  quotePdf,
} from "./pdf";
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

describe("limits on what one PDF can cost", () => {
  const long = "i".repeat(500); // narrow glyphs: the most characters per line
  const stuff = (lines: number, perLine: number) => {
    const stuffed = quote(
      Array.from({ length: lines }, (_, i) => `${long}${i}`),
    );
    for (const l of stuffed.lines) {
      l.result = {
        ...l.result,
        components: Array.from({ length: perLine }, () => ({
          kind: "overlay" as const,
          label: long,
          basis: long,
          amount: "1.00",
        })),
        warnings: Array.from({ length: perLine }, () => long),
      };
    }
    return stuffed;
  };

  it("counts the rows it prints", () => {
    // 5 header rows, 5 + 1 component per line, 8 footer rows + 1 shipment fee.
    expect(pdfRows(quote(["One"]))).toBe(5 + 6 + 9);
    expect(pdfRows(stuff(100, 50))).toBeGreaterThan(MAX_PDF_ROWS);
  });

  it("refuses a quote that is too long, printing nothing partial", async () => {
    await expect(quotePdf(stuff(100, 50), long)).rejects.toBeInstanceOf(
      QuoteTooLongError,
    );
  });

  it("prints the longest quote it accepts quickly, down to the totals and the disclaimer", async () => {
    // 100 lines of 5 + 4 + 4 rows, with every string at its stored maximum.
    const biggest = stuff(100, 4);
    expect(pdfRows(biggest)).toBeLessThanOrEqual(MAX_PDF_ROWS);
    const started = performance.now();
    const bytes = await quotePdf(biggest, long);
    const seconds = (performance.now() - started) / 1000;
    // Was about 5 minutes before the line cut was bounded (security audit H1).
    expect(seconds).toBeLessThan(5);
    const doc = await PDFDocument.load(bytes);
    // Every page ends inside the page: nothing is drawn below the bottom margin.
    expect(doc.getPageCount()).toBeGreaterThan(10);
  }, 20_000);
});
