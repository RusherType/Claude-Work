import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRows, toCsv, type CsvRow } from "./csv";
import {
  checkRow,
  checkRows,
  FIELDS,
  guessMapping,
  importBatchSchema,
  isCurrencyCode,
  mappingProblems,
  planBatches,
  problemsCsv,
  rowsCsv,
  shopifyColumns,
  templateRows,
  type Mapping,
} from "./import";

const ALL: Mapping = Object.fromEntries(FIELDS.map((f, i) => [f, i]));
const cells = (over: Partial<Record<(typeof FIELDS)[number], string>> = {}) =>
  FIELDS.map((f) => over[f] ?? "");
const numbered = (rows: string[][]): CsvRow[] =>
  rows.map((c, i) => ({ line: i + 2, cells: c }));
const USD = { currency: "USD" };

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
    expect(guessMapping(["name", "name"])).toEqual({ title: 0 });
  });

  it("does not guess a weight column that may be in pounds", () => {
    expect(guessMapping(["SKU", "Title", "Weight", "Net weight"])).toEqual({
      sku: 0,
      title: 1,
    });
    expect(guessMapping(["Weight in kg"])).toEqual({ weight_kg: 0 });
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
      USD,
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
    const r = checkRow(["S1", "T"], { sku: 0, title: 1 }, 2, USD);
    expect(r.row).toMatchObject({
      origin_country: null,
      customs_value: null,
      currency: null,
      tags: [],
    });
  });

  it("uses the file's currency for values without one, and ignores a currency without a value", () => {
    const value = checkRow(
      cells({ sku: "S", title: "T", customs_value: "5" }),
      ALL,
      2,
      {
        currency: "GBP",
      },
    );
    expect(value.row).toMatchObject({ customs_value: "5", currency: "GBP" });
    const noValue = checkRow(
      cells({ sku: "S", title: "T", currency: "EUR" }),
      ALL,
      2,
      USD,
    );
    expect(noValue.row).toMatchObject({ customs_value: null, currency: null });
    const noFileCurrency = checkRow(
      cells({ sku: "S", title: "T", customs_value: "5" }),
      ALL,
      2,
    );
    expect(noFileCurrency.errors.map((e) => e.field)).toEqual(["currency"]);
  });

  it("accepts ISO 4217 currencies only", () => {
    expect(isCurrencyCode("EUR")).toBe(true);
    expect(isCurrencyCode("XYZ")).toBe(false);
    const r = checkRow(
      cells({ sku: "S", title: "T", customs_value: "5", currency: "XYZ" }),
      ALL,
      2,
      USD,
    );
    expect(r.errors.map((e) => e.field)).toEqual(["currency"]);
  });

  it("reports every problem in the row with the field and line", () => {
    const r = checkRow(
      cells({
        origin_country: "Atlantis",
        customs_value: "12,50",
        weight_kg: "heavy",
      }),
      ALL,
      7,
      USD,
    );
    expect(r.row).toBeNull();
    expect(r.line).toBe(7);
    expect(r.errors.map((e) => e.field)).toEqual([
      "sku",
      "title",
      "origin_country",
      "customs_value",
      "weight_kg",
    ]);
    expect(r.errors[3].message).toMatch(/use a dot for decimals/);
  });

  it("rejects values the database columns cannot hold", () => {
    const check = (over: Parameters<typeof cells>[0]) =>
      checkRow(
        cells({ sku: "S", title: "T", ...over }),
        ALL,
        2,
        USD,
      ).errors.map((e) => e.field);
    expect(check({ customs_value: "-1" })).toEqual(["customs_value"]);
    expect(check({ customs_value: "1.234" })).toEqual(["customs_value"]);
    expect(check({ customs_value: "12345678901" })).toEqual(["customs_value"]);
    expect(check({ customs_value: "1234567890.99" })).toEqual([]);
    expect(check({ weight_kg: "1.2345" })).toEqual(["weight_kg"]);
    expect(check({ weight_kg: "12345678" })).toEqual(["weight_kg"]);
    expect(check({ weight_kg: "1234567.125" })).toEqual([]);
    expect(check({ image_urls: "http://a.test/x.jpg" })).toEqual([
      "image_urls",
    ]);
    expect(check({ image_urls: "javascript:alert(1)" })).toEqual([
      "image_urls",
    ]);
    expect(check({ title: "x".repeat(501) })).toEqual(["title"]);
  });

  it("rejects control characters such as NUL from a mis-decoded file", () => {
    const r = checkRow(
      cells({ sku: "S", title: "T\u0000e\u0000e" }),
      ALL,
      2,
      USD,
    );
    expect(r.errors[0].message).toBe("Title: contains control characters");
    expect(
      checkRow(
        cells({ sku: "S", title: "T", description: "a\tb\nc" }),
        ALL,
        2,
        USD,
      ).errors,
    ).toEqual([]);
  });
});

describe("checkRows", () => {
  it("flags repeated SKUs with the line of the first one", () => {
    const { checked } = checkRows(
      numbered([
        ["A", "One"],
        ["B", "Two"],
        ["A", "Three"],
      ]),
      { sku: 0, title: 1 },
    );
    expect(checked.map((c) => c.line)).toEqual([2, 3, 4]);
    expect(checked[2].row).toBeNull();
    expect(checked[2].errors[0].message).toMatch(/same SKU as line 2/);
  });

  it("keeps real line numbers and ignores blank rows", () => {
    const [, ...rows] = parseCsvRows(
      'sku,title\nA,One\n\n"B","Two\nlines"\n,\n,,,\nC,Three\n',
    );
    const { checked, blank } = checkRows(rows, { sku: 0, title: 1 });
    expect(checked.map((c) => c.line)).toEqual([2, 4, 8]);
    expect(checked.every((c) => c.errors.length === 0)).toBe(true);
    expect(blank).toBe(2);
  });

  it("checks 5,000 rows quickly", () => {
    const rows = numbered(
      Array.from({ length: 5000 }, (_, i) =>
        cells({
          sku: `SKU-${i}`,
          title: `Product ${i}`,
          origin_country: "CN",
          customs_value: "4.20",
        }),
      ),
    );
    const start = performance.now();
    const { checked } = checkRows(rows, ALL, USD);
    expect(checked.every((c) => c.errors.length === 0)).toBe(true);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("Shopify product export", () => {
  // A product with three variants (one without a SKU) and an extra image; a single-variant product
  // with three images; a product without a SKU.
  const HEADER =
    "Handle,Title,Body (HTML),Vendor,Type,Tags,Option1 Value,Variant SKU,Image Src,Cost per item";
  const csv = [
    HEADER,
    'crew-tee,Crew T-shirt,100% cotton,Acme,T-shirts,"cotton, menswear",M,TEE-M,https://cdn.test/tee-1.jpg,4.20',
    ",,,,,,,,,",
    "crew-tee,,,,,,L,TEE-L,,4.40",
    "crew-tee,,,,,,XL,,,4.60",
    "crew-tee,,,,,,,,https://cdn.test/tee-2.jpg,",
    "mug,Ceramic mug,Stoneware mug,Acme,Mugs,,Default Title,MUG-1,https://cdn.test/mug-1.jpg,2.10",
    "mug,,,,,,,,https://cdn.test/mug-2.jpg,",
    "mug,,,,,,,,https://cdn.test/mug-3.jpg,",
    "no-sku,Mystery,,,,,Default Title,,,",
  ].join("\n");

  const run = (text = csv) => {
    const [header, ...rows] = parseCsvRows(text);
    const mapping = guessMapping(header.cells);
    return {
      headers: header.cells,
      ...checkRows(rows, mapping, {
        currency: "USD",
        shopify: shopifyColumns(header.cells),
      }),
    };
  };

  it("turns each variant into a product with the product's details", () => {
    const { checked } = run();
    const ok = checked.filter((c) => c.row).map((c) => c.row!);
    expect(ok.map((r) => [r.sku, r.title])).toEqual([
      ["TEE-M", "Crew T-shirt (M)"],
      ["TEE-L", "Crew T-shirt (L)"],
      ["MUG-1", "Ceramic mug"],
    ]);
    expect(ok[1]).toMatchObject({
      description: "100% cotton",
      vendor: "Acme",
      product_type: "T-shirts",
      tags: ["cotton", "menswear"],
      customs_value: "4.40",
    });
  });

  it("gives every variant its own image first, then the product's other images", () => {
    const ok = run()
      .checked.filter((c) => c.row)
      .map((c) => c.row!);
    expect(ok[0].image_urls).toEqual([
      "https://cdn.test/tee-1.jpg",
      "https://cdn.test/tee-2.jpg",
    ]);
    expect(ok[1].image_urls).toEqual([
      "https://cdn.test/tee-1.jpg",
      "https://cdn.test/tee-2.jpg",
    ]);
    expect(ok[2].image_urls).toEqual([
      "https://cdn.test/mug-1.jpg",
      "https://cdn.test/mug-2.jpg",
      "https://cdn.test/mug-3.jpg",
    ]);
  });

  it("merges image-only rows and reports variants and products without a SKU", () => {
    const { checked, merged, blank } = run();
    expect(merged).toBe(3);
    expect(blank).toBe(1);
    const failed = checked.filter((c) => !c.row);
    expect(failed.map((c) => c.line)).toEqual([5, 10]);
    expect(failed.map((c) => c.errors[0].message)).toEqual([
      "SKU: required",
      "SKU: required",
    ]);
  });

  it("re-imports its own downloads without changing titles", () => {
    const first = run();
    const again = run(rowsCsv(first.headers, first.checked));
    expect(again.checked.map((c) => c.row?.title ?? null)).toEqual(
      first.checked.map((c) => c.row?.title ?? null),
    );
    const fixFile = run(
      problemsCsv(
        first.headers,
        first.checked.filter((c) => !c.row),
      ),
    );
    expect(fixFile.checked[0].cells[1]).toBe("Crew T-shirt (XL)");
  });
});

describe("reports", () => {
  it("exports failed rows in the file's columns, ready to fix and re-import", () => {
    const headers = ["sku", "title", "origin_country"];
    const failed = checkRows(numbered([["S1", "Tee", "Atlantis"]]), {
      sku: 0,
      title: 1,
      origin_country: 2,
    }).checked;
    const [head, row] = parseCsv(problemsCsv(headers, failed));
    expect(head).toEqual(["sku", "title", "origin_country", "problems"]);
    expect(row.slice(0, 3)).toEqual(["S1", "Tee", "Atlantis"]);
    expect(row[3]).toMatch(/Atlantis/);
    // Re-importing the fixed file ignores the extra column.
    expect(guessMapping(head)).toEqual({ sku: 0, title: 1, origin_country: 2 });
  });

  it("exports rows that were not sent yet", () => {
    const rows = checkRows(numbered([["S1", "Tee"]]), {
      sku: 0,
      title: 1,
    }).checked;
    expect(parseCsv(rowsCsv(["sku", "title"], rows))).toEqual([
      ["sku", "title"],
      ["S1", "Tee"],
    ]);
  });
});

describe("template", () => {
  it("is a valid import of one product", () => {
    const [header, ...rows] = parseCsvRows(toCsv(templateRows()));
    const { checked } = checkRows(rows, guessMapping(header.cells), USD);
    expect(checked).toHaveLength(1);
    expect(checked[0].errors).toEqual([]);
  });
});

describe("importBatchSchema", () => {
  const row = checkRow(cells({ sku: "S", title: "T" }), ALL, 2, USD).row!;
  const workspaceId = "00000000-0000-4000-8000-000000000001";

  it("accepts a valid batch", () => {
    expect(
      importBatchSchema.safeParse({ workspaceId, rows: [row] }).success,
    ).toBe(true);
  });

  it("rejects duplicates, extra fields, unpaired values, empty and oversized batches", () => {
    const ok = (rows: unknown[]) =>
      importBatchSchema.safeParse({ workspaceId, rows }).success;
    expect(ok([row, row])).toBe(false);
    expect(ok([{ ...row, content_hash: "x" }])).toBe(false);
    expect(ok([{ ...row, workspace_id: workspaceId }])).toBe(false);
    expect(ok([{ ...row, customs_value: "5" }])).toBe(false);
    expect(ok([{ ...row, currency: "USD" }])).toBe(false);
    expect(ok([{ ...row, customs_value: "5", currency: "USD" }])).toBe(true);
    expect(ok([{ ...row, title: "a\u0000b" }])).toBe(false);
    expect(ok([])).toBe(false);
    expect(
      ok(Array.from({ length: 501 }, (_, i) => ({ ...row, sku: `S${i}` }))),
    ).toBe(false);
    expect(
      importBatchSchema.safeParse({ workspaceId: "x", rows: [row] }).success,
    ).toBe(false);
  });
});

describe("planBatches", () => {
  const make = (n: number, description: string | null = null) =>
    Array.from({ length: n }, (_, i) => ({
      ...checkRow(cells({ sku: `S${i}`, title: "T" }), ALL, 2, USD).row!,
      description,
    }));

  it("splits by row count", () => {
    expect(planBatches(make(1201)).map((b) => b.length)).toEqual([
      500, 500, 201,
    ]);
    expect(planBatches([])).toEqual([]);
  });

  it("splits by size so each request stays under the limit", () => {
    const batches = planBatches(make(100, "é".repeat(19000)));
    expect(batches.length).toBeGreaterThan(1);
    for (const b of batches) {
      expect(new TextEncoder().encode(JSON.stringify(b)).length).toBeLessThan(
        750_000,
      );
    }
    expect(batches.flat()).toHaveLength(100);
  });
});
