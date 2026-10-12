import { describe, expect, it } from "vitest";
import {
  feeSchema,
  fieldErrors,
  formToInput,
  measureSchema,
  programSchema,
} from "./schemas";

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

const MEASURE: [string, string][] = [
  ["authority", "Section 301"],
  ["ch99_code", "9903.88.03"],
  ["hts_prefixes", "6109.10, 6110\n6205"],
  ["excluded_prefixes", ""],
  ["origin_countries", "cn hk"],
  ["rate_type", "ad_valorem"],
  ["rate_value", "25"],
  ["applies_to_modes", "ocean"],
  ["applies_to_modes", "air"],
  ["effective_from", "2026-01-01"],
  ["effective_to", ""],
  ["source_url", "https://www.federalregister.gov/d/2026-00001"],
  ["notes", ""],
];
const measure = (over: [string, string][] = [], drop: string[] = []) =>
  measureSchema.safeParse(
    formToInput(
      "measures",
      form([
        ...MEASURE.filter(
          ([k]) => !drop.includes(k) && !over.some(([o]) => o === k),
        ),
        ...over,
      ]),
    ),
  );

describe("measureSchema", () => {
  it("turns the form into a database row", () => {
    const r = measure();
    expect(r.success && r.data).toEqual({
      authority: "Section 301",
      ch99_code: "9903.88.03",
      hts_prefixes: ["610910", "6110", "6205"],
      excluded_prefixes: [],
      origin_countries: ["CN", "HK"],
      rate_type: "ad_valorem",
      rate_value: "25",
      applies_to_modes: ["ocean", "air"],
      exempt_programs: null,
      effective_from: "2026-01-01",
      effective_to: null,
      source_url: "https://www.federalregister.gov/d/2026-00001",
      notes: null,
    });
  });

  it("records exempt programs only when the admin says they were checked", () => {
    const none = measure([["exempt_known", "on"]]);
    expect(none.success && none.data.exempt_programs).toEqual([]);
    const some = measure([
      ["exempt_known", "on"],
      ["exempt_programs", "S, S+"],
    ]);
    expect(some.success && some.data.exempt_programs).toEqual(["S", "S+"]);
    const bad = measure([
      ["exempt_known", "on"],
      ["exempt_programs", "usmca"],
    ]);
    expect(bad.success).toBe(false);
  });

  it.each([
    [[["hts_prefixes", ""]], "hts_prefixes"],
    [[["hts_prefixes", "61x"]], "hts_prefixes"],
    [[["origin_countries", "China"]], "origin_countries"],
    [[["ch99_code", "990388"]], "ch99_code"],
    [[["rate_value", "25%"]], "rate_value"],
    [[["rate_value", "1234567"]], "rate_value"],
    [[["source_url", "http://example.test"]], "source_url"],
    [[["effective_from", "01/01/2026"]], "effective_from"],
    [[["effective_to", "2025-12-31"]], "effective_to"],
  ] as [[string, string][], string][])(
    "reports %j on its field",
    (over, field) => {
      const r = measure(over);
      expect(r.success).toBe(false);
      if (!r.success)
        expect(Object.keys(fieldErrors(r.error))).toContain(field);
    },
  );

  it("needs at least one mode", () => {
    const r = measure([], ["applies_to_modes"]);
    expect(r.success).toBe(false);
  });

  it("accepts ** for all origins", () => {
    const r = measure([["origin_countries", "**"]]);
    expect(r.success && r.data.origin_countries).toEqual(["**"]);
  });
});

describe("feeSchema", () => {
  const fee = (entries: [string, string][]) =>
    feeSchema.safeParse(
      formToInput(
        "fees",
        form([
          ["effective_from", "2026-10-01"],
          ["source_url", "https://www.cbp.gov/fees"],
          ...entries,
        ]),
      ),
    );

  it("accepts a formal MPF row with min and max", () => {
    const r = fee([
      ["fee_type", "mpf_formal"],
      ["pct", "0.3464"],
      ["min_amount", "32.71"],
      ["max_amount", "634.62"],
    ]);
    expect(r.success && r.data).toMatchObject({
      fee_type: "mpf_formal",
      mode: null,
      carrier: null,
      pct: "0.3464",
      min_amount: "32.71",
      max_amount: "634.62",
    });
  });

  it("needs an amount, puts the informal limit in flat amount, and orders min and max", () => {
    expect(fee([["fee_type", "hmf"]]).success).toBe(false);
    expect(
      fee([
        ["fee_type", "informal_entry_limit"],
        ["pct", "1"],
      ]).success,
    ).toBe(false);
    expect(
      fee([
        ["fee_type", "informal_entry_limit"],
        ["flat_amount", "2500.00"],
      ]).success,
    ).toBe(true);
    const r = fee([
      ["fee_type", "carrier_brokerage"],
      ["pct", "2"],
      ["min_amount", "100.00"],
      ["max_amount", "15.00"],
    ]);
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)).toHaveProperty("max_amount");
  });

  it("compares min and max exactly, not as floats", () => {
    expect(
      fee([
        ["fee_type", "carrier_brokerage"],
        ["pct", "2"],
        ["min_amount", "0.10"],
        ["max_amount", "0.1"],
      ]).success,
    ).toBe(true);
  });

  it("rejects unknown modes and fee types", () => {
    expect(
      fee([
        ["fee_type", "mpf"],
        ["pct", "1"],
      ]).success,
    ).toBe(false);
    expect(
      fee([
        ["fee_type", "hmf"],
        ["pct", "1"],
        ["mode", "rail"],
      ]).success,
    ).toBe(false);
  });
});

describe("programSchema", () => {
  const program = (entries: [string, string][]) =>
    programSchema.safeParse(
      formToInput(
        "programs",
        form([
          ["name", "USMCA"],
          ["effective_from", "2020-07-01"],
          ["source_url", "https://hts.usitc.gov/gn"],
          ...entries,
        ]),
      ),
    );

  it("accepts a program with countries and the MPF exemption", () => {
    const r = program([
      ["symbol", "s"],
      ["countries", "MX, CA"],
      ["mpf_exempt", "on"],
    ]);
    expect(r.success && r.data).toMatchObject({
      symbol: "S",
      countries: ["MX", "CA"],
      mpf_exempt: true,
    });
  });

  it("rejects bad symbols, ** and empty country lists", () => {
    expect(
      program([
        ["symbol", "USMCA"],
        ["countries", "MX"],
      ]).success,
    ).toBe(false);
    expect(
      program([
        ["symbol", "S"],
        ["countries", "**"],
      ]).success,
    ).toBe(false);
    expect(
      program([
        ["symbol", "S"],
        ["countries", ""],
      ]).success,
    ).toBe(false);
  });
});
