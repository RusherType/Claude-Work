import { describe, expect, it } from "vitest";
import { quoteInputSchema, saveQuoteSchema } from "./schema";

const P1 = "6f1c1f43-3d8f-4f0c-9a59-0a3c8d0f4b11";
const P2 = "0b6a3c1e-5f5d-4b9e-8a2a-6d1f2c3b4a59";
const base = {
  lines: [{ productId: P1, quantity: "100", unitValue: "4.20" }],
  origin: "CN",
  mode: "express",
  entryDate: "2026-11-01",
  currency: "USD",
  fxRateToUsd: "1",
  carrier: "",
};

describe("quoteInputSchema", () => {
  it("reads the form, quantities as whole numbers and a blank carrier as none", () => {
    expect(quoteInputSchema.parse(base)).toEqual({
      ...base,
      lines: [{ productId: P1, quantity: 100, unitValue: "4.20" }],
      carrier: null,
    });
  });

  it.each([
    [{ origin: "XX" }, "origin"],
    [{ mode: "rail" }, "mode"],
    [{ entryDate: "01/11/2026" }, "entryDate"],
    [{ currency: "ABC" }, "currency"],
    [{ fxRateToUsd: "0" }, "fxRateToUsd"],
    [{ fxRateToUsd: "1.123456789" }, "fxRateToUsd"],
    [{ fxRateToUsd: "0.5" }, "fxRateToUsd"], // USD converts at 1
    [{ lines: [] }, "lines"],
    [
      {
        lines: [
          { productId: P1, quantity: "1", unitValue: "1" },
          { productId: P1, quantity: "2", unitValue: "1" },
        ],
      },
      "lines",
    ],
    [{ lines: [{ productId: P1, quantity: "1.5", unitValue: "1" }] }, "lines"],
    [{ lines: [{ productId: P1, quantity: "0", unitValue: "1" }] }, "lines"],
    [
      { lines: [{ productId: P1, quantity: "1", unitValue: "4.205" }] },
      "lines",
    ],
    [{ lines: [{ productId: "x", quantity: "1", unitValue: "1" }] }, "lines"],
    [{ carrier: "x".repeat(61) }, "carrier"],
  ] as [Record<string, unknown>, string][])(
    "refuses %j on %s",
    (patch, field) => {
      const r = quoteInputSchema.safeParse({ ...base, ...patch });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].path[0]).toBe(field);
    },
  );

  it("takes another currency with the rate the person entered", () => {
    const r = quoteInputSchema.parse({
      ...base,
      currency: "INR",
      fxRateToUsd: "0.0119",
      lines: [
        { productId: P1, quantity: "10", unitValue: "350" },
        { productId: P2, quantity: "5", unitValue: "120.50" },
      ],
    });
    expect(r.fxRateToUsd).toBe("0.0119");
    expect(r.lines).toHaveLength(2);
  });

  it("allows at most 50 products", () => {
    const lines = Array.from({ length: 51 }, (_, i) => ({
      productId: `6f1c1f43-3d8f-4f0c-9a59-${String(i).padStart(12, "0")}`,
      quantity: "1",
      unitValue: "1",
    }));
    expect(quoteInputSchema.safeParse({ ...base, lines }).success).toBe(false);
  });
});

describe("saveQuoteSchema", () => {
  const save = { name: "November order", shown: '["ok"]', input: base };

  it("needs a name and what was shown", () => {
    expect(saveQuoteSchema.safeParse(save).success).toBe(true);
    for (const patch of [
      { name: " " },
      { shown: "" },
      { shown: "x".repeat(20_001) },
      { shown: undefined },
    ])
      expect(saveQuoteSchema.safeParse({ ...save, ...patch }).success).toBe(
        false,
      );
  });
});

describe("entry date", () => {
  it.each(["2000-01-01", "2026-11-01", "2100-12-31"])("accepts %s", (d) => {
    expect(quoteInputSchema.safeParse({ ...base, entryDate: d }).success).toBe(
      true,
    );
  });

  // The quotes table refuses these too; the form says so instead of failing on save.
  it.each(["1999-12-31", "2101-01-01", "0001-01-01", "9999-12-31"])(
    "refuses %s with a message on the field",
    (d) => {
      const r = quoteInputSchema.safeParse({ ...base, entryDate: d });
      expect(r.success).toBe(false);
      if (!r.success)
        expect(r.error.issues[0]).toMatchObject({
          path: ["entryDate"],
          message: "Use a date between 2000 and 2100.",
        });
    },
  );
});
