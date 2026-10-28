import { describe, expect, it } from "vitest";
import { landedCost } from "@/lib/tariff/landed-cost";
import {
  COLUMN2_SYMBOL,
  toCostLine,
  toFee,
  toMeasure,
  toPrograms,
  type FeeRow,
  type MeasureRow,
  type ProgramRow,
} from "./engine-input";

const measureRow: MeasureRow = {
  id: "m1",
  authority: "Section 301",
  ch99_code: "9903.88.15",
  hts_prefixes: ["6109"],
  excluded_prefixes: null,
  origin_countries: ["CN"],
  rate_type: "ad_valorem",
  rate_value: "7.5000",
  applies_to_modes: ["postal", "express", "ocean", "air"],
  exempt_programs: null,
  effective_from: "2026-01-01",
  effective_to: null,
  source_url: "https://ustr.gov/301",
};

const feeRows: FeeRow[] = [
  {
    id: "limit",
    fee_type: "informal_entry_limit",
    mode: null,
    carrier: null,
    pct: null,
    flat_amount: "2500.00",
    min_amount: null,
    max_amount: null,
    effective_from: "2026-01-01",
    effective_to: null,
    source_url: "https://www.cbp.gov/limit",
  },
  {
    id: "mpf",
    fee_type: "mpf_informal",
    mode: null,
    carrier: null,
    pct: null,
    flat_amount: "2.69",
    min_amount: null,
    max_amount: null,
    effective_from: "2026-01-01",
    effective_to: null,
    source_url: "https://www.cbp.gov/mpf",
  },
];

const program = (over: Partial<ProgramRow>): ProgramRow => ({
  symbol: "AU",
  countries: ["AU"],
  mpf_exempt: false,
  effective_from: "2026-01-01",
  effective_to: null,
  source_url: "https://hts.usitc.gov/gn",
  ...over,
});

describe("toMeasure", () => {
  it("maps a row and keeps 'nobody checked exemptions' as missing", () => {
    const m = toMeasure(measureRow);
    expect(m).toMatchObject({
      ch99Code: "9903.88.15",
      excludedPrefixes: [],
      rateValue: "7.5000",
    });
    expect(m).not.toHaveProperty("exemptPrograms");
    expect(toMeasure({ ...measureRow, exempt_programs: [] })).toHaveProperty(
      "exemptPrograms",
      [],
    );
  });
});

describe("toPrograms", () => {
  it("splits the Column 2 list from the programs, by date", () => {
    const rows = [
      program({ symbol: "AU" }),
      program({ symbol: COLUMN2_SYMBOL, countries: ["CU", "KP"] }),
      program({
        symbol: COLUMN2_SYMBOL,
        countries: ["RU"],
        effective_from: "2027-01-01",
      }),
    ];
    const { programs, column2Countries } = toPrograms(rows, "2026-11-01");
    expect(programs.map((p) => p.symbol)).toEqual(["AU"]);
    expect(column2Countries).toEqual(["CU", "KP"]);
    expect(toPrograms(rows, "2027-02-01").column2Countries).toEqual([
      "CU",
      "KP",
      "RU",
    ]);
  });
});

describe("toCostLine", () => {
  const tee = { id: "p1", code: "6109100012", weightKg: "0.180" };
  const line = {
    code: "6109100012",
    general_rate_raw: "16.5%",
    special_rate_raw: "Free (AU,BH)",
    column2_rate_raw: "90%",
  };

  it("multiplies value and weight by quantity exactly", () => {
    const l = toCostLine(
      { ...tee, status: "confirmed" },
      line,
      3,
      "4.10",
      "CN",
    );
    expect(l).toMatchObject({
      value: "12.30",
      quantity: 3,
      quantities: { kg: "0.54" },
      codeStatus: "confirmed",
      generalRate: { type: "rate" },
    });
    expect(l.specialRates).toHaveLength(1);
  });

  it("treats anything but a confirmed or broker-verified code as suggested", () => {
    for (const status of ["suggested", "in_review", "outdated", "queued"])
      expect(
        toCostLine({ ...tee, status }, line, 1, "1", "CN").codeStatus,
      ).toBe("suggested");
    expect(
      toCostLine({ ...tee, status: "broker_verified" }, line, 1, "1", "CN")
        .codeStatus,
    ).toBe("confirmed");
  });

  it("gives no rate when the code is not in the tariff in force", () => {
    const l = toCostLine(
      { ...tee, status: "confirmed", weightKg: null },
      undefined,
      1,
      "1",
      "CN",
    );
    expect(l.generalRate).toEqual({ type: "none" });
    expect(l).not.toHaveProperty("quantities");
  });
});

describe("the mapped rows price a quote end to end", () => {
  it("100 cotton T-shirts at $4.20 from China by express", () => {
    const result = landedCost({
      lines: [
        toCostLine(
          {
            id: "p1",
            code: "6109100012",
            status: "confirmed",
            weightKg: null,
          },
          {
            code: "6109100012",
            general_rate_raw: "16.5%",
            special_rate_raw: null,
            column2_rate_raw: "90%",
          },
          100,
          "4.20",
          "CN",
        ),
      ],
      shipment: {
        mode: "express",
        entryDate: "2026-11-01",
        currency: "USD",
        fxRateToUsd: "1",
        column2Countries: [],
      },
      measures: [toMeasure(measureRow)],
      fees: feeRows.map(toFee),
      programs: [],
    });
    // 420.00 value; 16.5% = 69.30 and 7.5% = 31.50 duty; informal MPF 2.69.
    expect(result.status).toBe("ok");
    expect(result.entryType).toBe("informal");
    expect(result.totals).toEqual({
      customsValue: "420.00",
      duties: "100.80",
      fees: "2.69",
      landedCost: "523.49",
    });
  });
});
