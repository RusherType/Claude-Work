import { describe, expect, it } from "vitest";
import {
  landedCost,
  type CostLine,
  type Fee,
  type LandedCostInput,
  type Measure,
  type Shipment,
} from "./landed-cost";
import { parseRate, parseSpecialRates } from "./rate";

// CD-050: hand-worked cases. Every rate and fee below is fixture data passed in, exactly as the
// app passes rows from tariff_lines, tariff_measures and fee_schedules. Nothing is built in.

const FEES: Fee[] = [
  fee("limit", "informal_entry_limit", { flatAmount: "2500.00" }),
  fee("mpf-formal", "mpf_formal", {
    pct: "0.3464",
    minAmount: "32.71",
    maxAmount: "634.62",
  }),
  fee("mpf-informal", "mpf_informal", { flatAmount: "2.62" }),
  fee("hmf", "hmf", { mode: "ocean", pct: "0.125" }),
];

function fee(
  id: string,
  feeType: Fee["feeType"],
  over: Partial<Fee> = {},
): Fee {
  return {
    id,
    feeType,
    mode: null,
    carrier: null,
    pct: null,
    flatAmount: null,
    minAmount: null,
    maxAmount: null,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceUrl: `https://example.test/${id}`,
    ...over,
  };
}

function measure(id: string, over: Partial<Measure> = {}): Measure {
  return {
    id,
    authority: "Section 301",
    ch99Code: "9903.88.03",
    htsPrefixes: ["6109"],
    excludedPrefixes: [],
    originCountries: ["CN"],
    rateType: "ad_valorem",
    rateValue: "25",
    appliesToModes: ["postal", "express", "ocean", "air"],
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceUrl: `https://example.test/${id}`,
    ...over,
  };
}

function line(over: Partial<CostLine> = {}): CostLine {
  return {
    id: "l1",
    code: "6109100012",
    origin: "IN",
    value: "1000.00",
    quantity: 1,
    generalRate: parseRate("5.3%"),
    ...over,
  };
}

const SHIPMENT: Shipment = {
  mode: "express",
  entryDate: "2026-06-15",
  currency: "USD",
  fxRateToUsd: "1",
  column2Countries: ["CU", "KP"],
};

function run(over: Partial<LandedCostInput> & { lines?: CostLine[] } = {}) {
  return landedCost({
    lines: [line()],
    shipment: SHIPMENT,
    measures: [],
    fees: FEES,
    ...over,
  });
}

const amountOf = (r: ReturnType<typeof run>, kind: string, lineIndex = 0) =>
  r.lines[lineIndex].components
    .filter((c) => c.kind === kind)
    .map((c) => c.amount);
const shipFee = (r: ReturnType<typeof run>, kind: string) =>
  r.shipmentFees.find((c) => c.kind === kind)?.amount;

describe("base duty rates", () => {
  it("1. free lines pay no duty", () => {
    const r = run({ lines: [line({ generalRate: parseRate("Free") })] });
    expect(amountOf(r, "duty_general")).toEqual(["0.00"]);
    expect(r.totals.duties).toBe("0.00");
  });

  it("2. ad valorem: 5.3% of $1,000.00", () => {
    expect(amountOf(run(), "duty_general")).toEqual(["53.00"]);
  });

  it("3. specific per kg: 2.4¢/kg × 12.5 kg", () => {
    const r = run({
      lines: [
        line({ generalRate: parseRate("2.4¢/kg"), quantities: { kg: "12.5" } }),
      ],
    });
    expect(amountOf(r, "duty_general")).toEqual(["0.30"]);
  });

  it("4. specific per unit: $0.45 each × 10", () => {
    const r = run({
      lines: [line({ generalRate: parseRate("$0.45 each"), quantity: 10 })],
    });
    expect(amountOf(r, "duty_general")).toEqual(["4.50"]);
  });

  it("5. compound: 25¢/kg + 3.4% on $200.00 and 4 kg", () => {
    const r = run({
      lines: [
        line({
          value: "200.00",
          generalRate: parseRate("25¢/kg + 3.4%"),
          quantities: { kg: "4" },
        }),
      ],
    });
    // 1.00 + 6.80, each part rounded to cents, shown as one general-duty component per part.
    expect(amountOf(r, "duty_general")).toEqual(["1.00", "6.80"]);
    expect(r.lines[0].dutyTotal).toBe("7.80");
  });

  it("6. special rate when the FTA program is claimed for that origin", () => {
    const r = run({
      lines: [
        line({
          origin: "AU",
          specialRates: parseSpecialRates("Free (A+,AU,KR)")!,
          claimedProgram: "AU",
        }),
      ],
    });
    expect(amountOf(r, "duty_special")).toEqual(["0.00"]);
    expect(amountOf(r, "duty_general")).toEqual([]);
  });

  it("7. general rate when the claimed program is not listed for the line", () => {
    const r = run({
      lines: [
        line({
          specialRates: parseSpecialRates("Free (AU,KR)")!,
          claimedProgram: "JP",
        }),
      ],
    });
    expect(amountOf(r, "duty_general")).toEqual(["53.00"]);
    expect(r.lines[0].warnings.join(" ")).toMatch(/JP/);
  });

  it("8. column 2 rate for origins in the column 2 list", () => {
    const r = run({
      lines: [line({ origin: "KP", column2Rate: parseRate("90%") })],
    });
    expect(amountOf(r, "duty_column2")).toEqual(["900.00"]);
  });

  it("9. column 2 origin without a column 2 rate needs review", () => {
    const r = run({ lines: [line({ origin: "CU" })] });
    expect(r.lines[0].status).toBe("needs_review");
  });
});

describe("Chapter 99 overlays", () => {
  const cn = (over: Partial<CostLine> = {}) =>
    line({ origin: "CN", generalRate: parseRate("16.5%"), ...over });

  it("10. one overlay adds 25% of value", () => {
    const r = run({ lines: [cn()], measures: [measure("m1")] });
    expect(amountOf(r, "duty_general")).toEqual(["165.00"]);
    expect(amountOf(r, "overlay")).toEqual(["250.00"]);
    expect(r.lines[0].dutyTotal).toBe("415.00");
  });

  it("11. two overlays stack", () => {
    const r = run({
      lines: [cn()],
      measures: [
        measure("m1"),
        measure("m2", { authority: "Section 232", rateValue: "10" }),
      ],
    });
    expect(amountOf(r, "overlay")).toEqual(["250.00", "100.00"]);
    expect(r.lines[0].dutyTotal).toBe("515.00");
  });

  it("12. an excluded prefix is not covered", () => {
    const r = run({
      lines: [cn()],
      measures: [
        measure("m1", { htsPrefixes: ["61"], excludedPrefixes: ["6109"] }),
      ],
    });
    expect(amountOf(r, "overlay")).toEqual([]);
  });

  it("13. origin match applies", () => {
    const r = run({
      lines: [cn()],
      measures: [measure("m1", { originCountries: ["HK", "CN"] })],
    });
    expect(amountOf(r, "overlay")).toEqual(["250.00"]);
  });

  it("14. origin non-match does not apply", () => {
    const r = run({ lines: [cn({ origin: "VN" })], measures: [measure("m1")] });
    expect(amountOf(r, "overlay")).toEqual([]);
  });

  it("15. '**' covers every origin", () => {
    const r = run({
      lines: [cn({ origin: "VN" })],
      measures: [measure("m1", { originCountries: ["**"] })],
    });
    expect(amountOf(r, "overlay")).toEqual(["250.00"]);
  });

  it("16. a measure starting mid-month does not apply the day before", () => {
    const r = run({
      lines: [cn()],
      measures: [measure("m1", { effectiveFrom: "2026-06-16" })],
    });
    expect(amountOf(r, "overlay")).toEqual([]);
  });

  it("17. a measure applies from its start date (inclusive)", () => {
    const r = run({
      lines: [cn()],
      shipment: { ...SHIPMENT, entryDate: "2026-06-16" },
      measures: [measure("m1", { effectiveFrom: "2026-06-16" })],
    });
    expect(amountOf(r, "overlay")).toEqual(["250.00"]);
  });

  it("18. a measure ending mid-month still applies on its end date", () => {
    const r = run({
      lines: [cn()],
      measures: [measure("m1", { effectiveTo: "2026-06-15" })],
    });
    expect(amountOf(r, "overlay")).toEqual(["250.00"]);
  });

  it("19. a measure does not apply after its end date", () => {
    const r = run({
      lines: [cn()],
      shipment: { ...SHIPMENT, entryDate: "2026-06-16" },
      measures: [measure("m1", { effectiveTo: "2026-06-15" })],
    });
    expect(amountOf(r, "overlay")).toEqual([]);
  });

  it("20. a measure limited to other modes does not apply", () => {
    const r = run({
      lines: [cn()],
      shipment: { ...SHIPMENT, mode: "postal" },
      measures: [measure("m1", { appliesToModes: ["ocean", "air"] })],
    });
    expect(amountOf(r, "overlay")).toEqual([]);
  });

  it("21. a flat per-item measure multiplies by item count", () => {
    const r = run({
      lines: [cn({ quantity: 3 })],
      measures: [measure("m1", { rateType: "flat_per_item", rateValue: "5" })],
    });
    expect(amountOf(r, "overlay")).toEqual(["15.00"]);
  });

  it("22. overlays carry their source and effective dates", () => {
    const r = run({
      lines: [cn()],
      measures: [measure("m1", { effectiveTo: "2026-12-31" })],
    });
    const overlay = r.lines[0].components.find((c) => c.kind === "overlay")!;
    expect(overlay.source).toEqual({
      table: "tariff_measures",
      id: "m1",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      sourceUrl: "https://example.test/m1",
    });
    expect(overlay.label).toMatch(/Section 301.*9903\.88\.03/);
  });
});

describe("merchandise processing fee", () => {
  it("23. formal entry pays at least the minimum", () => {
    const r = run({ lines: [line({ value: "3000.00" })] });
    expect(r.entryType).toBe("formal");
    expect(shipFee(r, "mpf")).toBe("32.71"); // 0.3464% = 10.39
  });

  it("24. formal entry pays at most the maximum", () => {
    const r = run({ lines: [line({ value: "500000.00" })] });
    expect(shipFee(r, "mpf")).toBe("634.62"); // 0.3464% = 1,732.00
  });

  it("25. formal entry between the limits pays the percentage", () => {
    expect(shipFee(run({ lines: [line({ value: "50000.00" })] }), "mpf")).toBe(
      "173.20",
    );
  });

  it("26. informal entry pays the flat fee", () => {
    const r = run({ lines: [line({ value: "800.00" })] });
    expect(r.entryType).toBe("informal");
    expect(shipFee(r, "mpf")).toBe("2.62");
  });

  it("27. exactly the informal limit is informal; a cent more is formal", () => {
    expect(run({ lines: [line({ value: "2500.00" })] }).entryType).toBe(
      "informal",
    );
    const over = run({ lines: [line({ value: "2500.01" })] });
    expect(over.entryType).toBe("formal");
    expect(shipFee(over, "mpf")).toBe("32.71");
  });

  it("28. without an informal limit in the data, entries are treated as formal with a warning", () => {
    const r = run({
      fees: FEES.filter((f) => f.feeType !== "informal_entry_limit"),
    });
    expect(r.entryType).toBe("formal");
    expect(r.warnings.join(" ")).toMatch(/informal entry limit/i);
  });

  it("29. the fee in force on the entry date is used", () => {
    const fees = [
      ...FEES.filter((f) => f.feeType !== "mpf_informal"),
      fee("mpf-old", "mpf_informal", {
        flatAmount: "2.62",
        effectiveTo: "2026-09-30",
      }),
      fee("mpf-new", "mpf_informal", {
        flatAmount: "2.69",
        effectiveFrom: "2026-10-01",
      }),
    ];
    const r = run({ fees, shipment: { ...SHIPMENT, entryDate: "2026-10-01" } });
    expect(shipFee(r, "mpf")).toBe("2.69");
  });
});

describe("modes and carrier fees", () => {
  const modeFees = [
    ...FEES,
    fee("mpf-postal", "mpf_informal", { mode: "postal", flatAmount: "0.00" }),
    fee("broker-express", "carrier_brokerage", {
      mode: "express",
      flatAmount: "12.50",
    }),
    fee("broker-dhl", "carrier_brokerage", {
      mode: "express",
      carrier: "DHL",
      pct: "2",
      minAmount: "15.00",
      maxAmount: "100.00",
    }),
  ];

  it("30. postal uses the postal-specific fee row and no carrier fee", () => {
    const r = run({
      fees: modeFees,
      shipment: { ...SHIPMENT, mode: "postal" },
    });
    expect(shipFee(r, "mpf")).toBe("0.00");
    expect(shipFee(r, "carrier_fee")).toBeUndefined();
  });

  it("31. express uses the general MPF row and the express carrier fee", () => {
    const r = run({ fees: modeFees });
    expect(shipFee(r, "mpf")).toBe("2.62");
    expect(shipFee(r, "carrier_fee")).toBe("12.50");
  });

  it("32. ocean pays harbor maintenance fee on value", () => {
    const r = run({
      lines: [line({ value: "40000.00" })],
      shipment: { ...SHIPMENT, mode: "ocean" },
    });
    expect(shipFee(r, "hmf")).toBe("50.00"); // 0.125%
    expect(shipFee(r, "mpf")).toBe("138.56"); // 0.3464%
  });

  it("33. air pays no harbor maintenance fee", () => {
    const r = run({
      lines: [line({ value: "40000.00" })],
      shipment: { ...SHIPMENT, mode: "air" },
    });
    expect(shipFee(r, "hmf")).toBeUndefined();
  });

  it("34. a carrier-specific percentage fee wins over the generic row and respects its minimum", () => {
    const r = run({
      fees: modeFees,
      lines: [line({ value: "400.00" })],
      shipment: { ...SHIPMENT, carrier: "DHL" },
    });
    expect(shipFee(r, "carrier_fee")).toBe("15.00"); // 2% = 8.00, minimum 15.00
  });
});

describe("baskets, currency and rounding", () => {
  it("35. a multi-line basket totals duties and allocates shipment fees by value", () => {
    const r = run({
      lines: [
        line({ id: "a", value: "600.00" }),
        line({ id: "b", value: "400.00" }),
      ],
    });
    expect(r.lines.map((l) => l.dutyTotal)).toEqual(["31.80", "21.20"]);
    expect(r.lines.map((l) => l.allocatedFees)).toEqual(["1.57", "1.05"]);
    expect(r.lines.map((l) => l.landedCost)).toEqual(["633.37", "422.25"]);
    expect(r.totals).toEqual({
      customsValue: "1000.00",
      duties: "53.00",
      fees: "2.62",
      landedCost: "1055.62",
    });
  });

  it("36. fee allocation always sums to the fee, cent for cent", () => {
    const r = run({
      lines: [
        line({ id: "a", value: "100.00" }),
        line({ id: "b", value: "100.00" }),
        line({ id: "c", value: "100.00" }),
      ],
    });
    expect(r.lines.map((l) => l.allocatedFees)).toEqual([
      "0.88",
      "0.87",
      "0.87",
    ]);
  });

  it("37. zero value pays no ad valorem duty but still pays specific duty", () => {
    const r = run({
      lines: [
        line({ value: "0.00", generalRate: parseRate("5%") }),
        line({
          id: "w",
          value: "0.00",
          generalRate: parseRate("2.4¢/kg"),
          quantities: { kg: "10" },
        }),
      ],
    });
    expect(r.lines.map((l) => l.dutyTotal)).toEqual(["0.00", "0.24"]);
  });

  it("38. converts the declared currency to US dollars first", () => {
    const r = run({
      shipment: { ...SHIPMENT, currency: "EUR", fxRateToUsd: "1.085" },
    });
    expect(r.lines[0].customsValueUsd).toBe("1085.00");
    expect(amountOf(r, "duty_general")).toEqual(["57.51"]); // 57.505 rounds half up
  });

  it("39. rounds half up to the cent", () => {
    const r = run({
      lines: [line({ value: "10.10", generalRate: parseRate("5%") })],
    });
    expect(amountOf(r, "duty_general")).toEqual(["0.51"]); // 0.505
  });

  it("40. rounds each component to the cent before adding", () => {
    const r = run({
      lines: [
        line({
          value: "0.15",
          generalRate: parseRate("2.4¢/kg + 3.4%"),
          quantities: { kg: "0.25" },
        }),
      ],
    });
    // 0.006 -> 0.01 and 0.0051 -> 0.01; the unrounded sum 0.0111 would have been 0.01.
    expect(amountOf(r, "duty_general")).toEqual(["0.01", "0.01"]);
    expect(r.lines[0].dutyTotal).toBe("0.02");
  });
});

describe("what the engine refuses to guess", () => {
  it("41. complex rate text needs review and computes no base duty", () => {
    const r = run({
      lines: [line({ generalRate: parseRate("33¢/kg but not less than 2%") })],
    });
    expect(r.lines[0].status).toBe("needs_review");
    expect(amountOf(r, "duty_general")).toEqual([]);
    expect(r.status).toBe("needs_review");
  });

  it("42. a specific rate without the needed quantity needs review", () => {
    const r = run({ lines: [line({ generalRate: parseRate("2.4¢/kg") })] });
    expect(r.lines[0].status).toBe("needs_review");
    expect(r.lines[0].warnings.join(" ")).toMatch(/kg/);
  });

  it("43. a line with no rate (not a leaf code) needs review", () => {
    const r = run({ lines: [line({ generalRate: parseRate("") })] });
    expect(r.lines[0].status).toBe("needs_review");
  });

  it("44. a quantity basis such as drained weight is flagged", () => {
    const r = run({
      lines: [
        line({
          generalRate: parseRate("37.5¢/kg on drained weight"),
          quantities: { kg: "2" },
        }),
      ],
    });
    expect(amountOf(r, "duty_general")).toEqual(["0.75"]);
    expect(r.lines[0].warnings.join(" ")).toMatch(/drained weight/);
  });

  it("45. a suggested (unconfirmed) code is flagged", () => {
    const r = run({ lines: [line({ codeStatus: "suggested" })] });
    expect(r.lines[0].warnings.join(" ")).toMatch(/suggested code/i);
  });

  it("46. rejects invalid money and dates instead of producing NaN", () => {
    expect(() => run({ lines: [line({ value: "1,000" })] })).toThrow(/value/);
    expect(() =>
      run({ shipment: { ...SHIPMENT, entryDate: "15/06/2026" } }),
    ).toThrow(/date/);
    expect(() => run({ shipment: { ...SHIPMENT, fxRateToUsd: "0" } })).toThrow(
      /exchange rate/,
    );
  });
});
