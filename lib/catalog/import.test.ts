import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";
import {
  checkRow,
  checkRows,
  FIELDS,
  guessMapping,
  importBatchSchema,
  mappingProblems,
  planBatches,
  templateRows,
  type Mapping,
} from "./import";

const ALL: Mapping = Object.fromEntries(FIELDS.map((f, i) => [f, i]));
const cells = (over: Partial<Record<(typeof FIELDS)[number], string>> = {}) =>
  FIELDS.map((f) => over[f] ?? "");

describe("guessMapping", () => {
  it("maps our template headers exactly", () => {
    expect(guessMapping([...FIELDS])).toEqual(ALL);
  });

  it("recognises a Shopify product export", () => {
    const headers = [
      "Handle",
      "Title",
      "Body (HTML)",
      "Vendor",
      "Type",
      "Tags",
      "Variant SKU",
      "Image Src",
      "Cost per item",
    ];
    expect(guessMapping(headers)).toEqual({
      title: 1,
      description: 2,
      vendor: 3,
      product_type: 4,
      tags: 5,
      sku: 6,
      image_urls: 7,
      customs_value: 8,
    });
  });

  it("recognises common variants and never uses a column twice", () => {
    expect(
      guessMapping(["Product Name", "Country of Origin", "Weight (kg)", "SKU"]),
    ).toEqual({ title: 0, origin_country: 1, weight_kg: 2, sku: 3 });
    const m = guessMapping(["name", "name"]);
    expect(m).toEqual({ title: 0 });
  });
});

describe("mappingProblems", () => {
  it("requires SKU and title", () => {
    expect(mappingProblems({})).toHaveLength(2);
    expect(mappingProblems({ sku: 0, title: 1 })).toEqual([]);
  });

  it("rejects one column for two fields", () => {
    expect(mappingProblems({ sku: 0, title: 0 })).toEqual([
      "Each column can be used for one field only.",
    ]);
  });
});

describe("checkRow", () => {
  it("accepts a full row and normalises it", () => {
    const r = checkRow(
      cells({
        sku: " TEE-1 ",
        title: "Crew T-shirt",
        description: "100% cotton",
        tags: "cotton; menswear, ,summer",
        image_urls: "https://a.test/1.jpg | https://a.test/2.jpg",
        origin_country: "china",
        customs_value: "$1,234.50",
        currency: "eur",
        weight_kg: "0.180",
      }),
      ALL,
      2,
    );
    expect(r.errors).toEqual([]);
    expect(r.row).toEqual({
      sku: "TEE-1",
      title: "Crew T-shirt",
      description: "100% cotton",
      product_type: null,
      vendor: null,
      tags: ["cotton", "menswear", "summer"],
      image_urls: ["https://a.test/1.jpg", "https://a.test/2.jpg"],
      origin_country: "CN",
      customs_value: "1234.50",
      currency: "EUR",
      weight_kg: "0.180",
    });
  });

  it("leaves blank and unmapped cells as null", () => {
    const r = checkRow(["S1", "T"], { sku: 0, title: 1 }, 2);
    expect(r.row).toMatchObject({
      origin_country: null,
      customs_value: null,
      currency: null,
      tags: [],
    });
  });

  it("reports every problem in the row with the field and line", () => {
    const r = checkRow(
      cells({
        origin_country: "Atlantis",
        customs_value: "12,50",
        weight_kg: "heavy",
        currency: "dollars",
      }),
      ALL,
      7,
    );
    expect(r.row).toBeNull();
    expect(r.line).toBe(7);
    expect(r.errors.map((e) => e.field)).toEqual([
      "sku",
      "title",
      "origin_country",
      "customs_value",
      "weight_kg",
      "currency",
    ]);
    expect(r.errors[3].message).toMatch(/use a dot for decimals/);
  });

  it("rejects negative amounts, too many decimals and non-https images", () => {
    const check = (over: Parameters<typeof cells>[0]) =>
      checkRow(cells({ sku: "S", title: "T", ...over }), ALL, 2).errors.map(
        (e) => e.field,
      );
    expect(check({ customs_value: "-1" })).toEqual(["customs_value"]);
    expect(check({ customs_value: "1.234" })).toEqual(["customs_value"]);
    expect(check({ weight_kg: "1.2345" })).toEqual(["weight_kg"]);
    expect(check({ image_urls: "http://a.test/x.jpg" })).toEqual([
      "image_urls",
    ]);
    expect(check({ image_urls: "javascript:alert(1)" })).toEqual([
      "image_urls",
    ]);
    expect(check({ title: "x".repeat(501) })).toEqual(["title"]);
  });
});

describe("checkRows", () => {
  it("flags repeated SKUs with the line of the first one", () => {
    const rows = [
      ["A", "One"],
      ["B", "Two"],
      ["A", "Three"],
    ];
    const checked = checkRows(rows, { sku: 0, title: 1 });
    expect(checked.map((c) => c.line)).toEqual([2, 3, 4]);
    expect(checked[2].row).toBeNull();
    expect(checked[2].errors[0].message).toMatch(/same SKU as line 2/);
  });

  it("checks 5,000 rows quickly", () => {
    const rows = Array.from({ length: 5000 }, (_, i) =>
      cells({
        sku: `SKU-${i}`,
        title: `Product ${i}`,
        origin_country: "CN",
        customs_value: "4.20",
      }),
    );
    const start = performance.now();
    const checked = checkRows(rows, ALL);
    expect(checked.every((c) => c.errors.length === 0)).toBe(true);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("template", () => {
  it("is a valid import of one product", () => {
    const [headers, ...rows] = parseCsv(toCsv(templateRows()));
    const checked = checkRows(rows, guessMapping(headers));
    expect(checked).toHaveLength(1);
    expect(checked[0].errors).toEqual([]);
  });
});

describe("importBatchSchema", () => {
  const row = checkRow(cells({ sku: "S", title: "T" }), ALL, 2).row!;
  const workspaceId = "00000000-0000-4000-8000-000000000001";

  it("accepts a valid batch", () => {
    expect(
      importBatchSchema.safeParse({ workspaceId, rows: [row] }).success,
    ).toBe(true);
  });

  it("rejects duplicates, extra fields, empty and oversized batches", () => {
    const bad = (rows: unknown[]) =>
      importBatchSchema.safeParse({ workspaceId, rows }).success;
    expect(bad([row, row])).toBe(false);
    expect(bad([{ ...row, content_hash: "x" }])).toBe(false);
    expect(bad([{ ...row, workspace_id: workspaceId }])).toBe(false);
    expect(bad([])).toBe(false);
    expect(
      bad(Array.from({ length: 501 }, (_, i) => ({ ...row, sku: `S${i}` }))),
    ).toBe(false);
    expect(
      importBatchSchema.safeParse({ workspaceId: "x", rows: [row] }).success,
    ).toBe(false);
  });
});

describe("planBatches", () => {
  const make = (n: number, description: string | null = null) =>
    Array.from({ length: n }, (_, i) => ({
      ...checkRow(cells({ sku: `S${i}`, title: "T" }), ALL, 2).row!,
      description,
    }));

  it("splits by row count", () => {
    expect(planBatches(make(1201)).map((b) => b.length)).toEqual([
      500, 500, 201,
    ]);
    expect(planBatches([])).toEqual([]);
  });

  it("splits by size so each request stays under the limit", () => {
    const rows = make(100, "é".repeat(19000)); // about 38 KB of UTF-8 each
    const batches = planBatches(rows);
    expect(batches.length).toBeGreaterThan(1);
    for (const b of batches) {
      expect(new TextEncoder().encode(JSON.stringify(b)).length).toBeLessThan(
        750_000,
      );
    }
    expect(batches.flat()).toHaveLength(100);
  });
});
