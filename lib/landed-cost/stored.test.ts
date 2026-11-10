import { describe, expect, it } from "vitest";
import { landedCost } from "@/lib/tariff/landed-cost";
import type { Component } from "@/lib/tariff/landed-cost/types";
import { parseRate } from "@/lib/tariff/rate";
import {
  lineResultSchema,
  referencedRows,
  relinkSources,
  storedTotalsSchema,
  totalsToStore,
} from "./stored";

const M = "00000000-0000-4000-8000-00000000000a";
const F = "00000000-0000-4000-8000-00000000000b";

function price(value: string, fx = "1") {
  return landedCost({
    lines: [
      {
        id: "p1",
        code: "6109100012",
        origin: "CN",
        value,
        quantity: 1,
        generalRate: parseRate("16.5%"),
        // Unconfirmed, so the result carries a warning too.
        codeStatus: "suggested",
      },
    ],
    shipment: {
      mode: "express",
      entryDate: "2026-11-01",
      currency: fx === "1" ? "USD" : "KWD",
      fxRateToUsd: fx,
      carrier: "DHL",
      column2Countries: [],
    },
    measures: [
      {
        id: M,
        authority: "Section 301",
        ch99Code: "9903.88.15",
        htsPrefixes: ["6109"],
        excludedPrefixes: [],
        originCountries: ["CN"],
        rateType: "ad_valorem",
        rateValue: "7.5",
        appliesToModes: ["express"],
        exemptPrograms: [],
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        sourceUrl: "https://ustr.gov/301",
      },
    ],
    fees: [
      {
        id: F,
        feeType: "carrier_brokerage",
        mode: "express",
        carrier: "DHL",
        pct: null,
        flatAmount: "15.00",
        minAmount: null,
        maxAmount: null,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        sourceUrl: "https://example.test/dhl",
      },
    ],
  });
}

describe("what the engine writes reads back", () => {
  it("round-trips a result with an overlay, a carrier fee and review notes", () => {
    const result = price("420.00");
    expect(result.status).toBe("needs_review"); // no informal limit or MPF row
    const stored = JSON.parse(
      JSON.stringify({
        totals: totalsToStore(result, ["A notice"]),
        line: result.lines[0],
      }),
    );
    expect(storedTotalsSchema.parse(stored.totals)).toEqual(stored.totals);
    expect(lineResultSchema.parse(stored.line)).toEqual(stored.line);
    expect(stored.line.components.map((c: Component) => c.kind)).toEqual([
      "duty_general",
      "overlay",
    ]);
  });

  it("round-trips the largest quote the form allows", () => {
    // 9,999,999,999.99 per item × 1,000,000 items at 9,999,999,999.99999999 dollars each.
    const result = price("9999999999990000.00", "9999999999.99999999");
    const stored = JSON.parse(
      JSON.stringify({
        totals: totalsToStore(result, []),
        line: result.lines[0],
      }),
    );
    expect(storedTotalsSchema.safeParse(stored.totals).success).toBe(true);
    expect(lineResultSchema.safeParse(stored.line).success).toBe(true);
  });
});

describe("stored JSON that is not ours", () => {
  const line = price("420.00").lines[0];
  const withComponent = (patch: Record<string, unknown>) => ({
    ...line,
    components: [{ ...line.components[1], ...patch }],
  });

  it("drops links that are not https", () => {
    for (const sourceUrl of [
      "http://ustr.gov/301",
      "javascript:alert(1)",
      "data:text/html,x",
      "not a url",
    ]) {
      const parsed = lineResultSchema.parse(
        withComponent({
          source: { ...line.components[1].source, sourceUrl },
        }),
      );
      expect(parsed.components[0].source).toMatchObject({ sourceUrl: null });
    }
  });

  it.each([
    [{ kind: "bribe" }],
    [{ amount: "12.345" }],
    [{ amount: "1e9" }],
    [{ amount: "$5" }],
    [{ label: "x".repeat(501) }],
    [{ source: { table: "users", id: "1" } }],
  ])("rejects a component with %j", (patch) => {
    expect(lineResultSchema.safeParse(withComponent(patch)).success).toBe(
      false,
    );
  });

  it("rejects oversized lists and unknown statuses", () => {
    expect(
      lineResultSchema.safeParse({
        ...line,
        components: Array.from({ length: 51 }, () => line.components[0]),
      }).success,
    ).toBe(false);
    expect(
      lineResultSchema.safeParse({
        ...line,
        warnings: Array.from({ length: 51 }, () => "w"),
      }).success,
    ).toBe(false);
    expect(
      lineResultSchema.safeParse({ ...line, status: "fine" }).success,
    ).toBe(false);
    expect(storedTotalsSchema.safeParse({}).success).toBe(false);
    expect(storedTotalsSchema.safeParse(null).success).toBe(false);
  });
});

describe("source links come from the reference rows", () => {
  const components = [
    ...price("420.00").lines[0].components,
    ...price("420.00").shipmentFees,
  ];

  it("lists the measure and fee rows a breakdown points at", () => {
    expect(referencedRows(components)).toEqual({
      tariff_measures: [M],
      fee_schedules: [F],
    });
    expect(
      referencedRows([
        {
          ...components[1],
          source: {
            table: "tariff_measures",
            id: "1 or 1=1",
            effectiveFrom: "2026-01-01",
            effectiveTo: null,
            sourceUrl: null,
          },
        },
      ]),
    ).toEqual({ tariff_measures: [], fee_schedules: [] });
  });

  it("replaces stored links with the published ones, or with nothing", () => {
    const forged = components.map((c) =>
      c.source && c.source.table !== "tariff_lines"
        ? { ...c, source: { ...c.source, sourceUrl: "https://evil.example/" } }
        : c,
    );
    const urls = new Map([[`tariff_measures:${M}`, "https://ustr.gov/301"]]);
    const linked = relinkSources(forged, urls);
    expect(linked[0]).toEqual(components[0]); // tariff line sources have no link
    expect(linked[1].source).toMatchObject({
      sourceUrl: "https://ustr.gov/301",
    });
    expect(linked.at(-1)?.source).toMatchObject({ sourceUrl: null });
    expect(
      relinkSources(
        forged,
        new Map([[`tariff_measures:${M}`, "javascript:alert(1)"]]),
      )[1].source,
    ).toMatchObject({ sourceUrl: null });
  });
});
