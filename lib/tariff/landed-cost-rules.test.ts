import { describe, expect, it } from "vitest";
import {
  landedCost,
  type CostLine,
  type Fee,
  type LandedCostInput,
  type Measure,
  type Program,
} from "./landed-cost";
import { parseRate, parseSpecialRates } from "./rate";

// CD-050: what the engine refuses to guess, and how it treats bad data. Fixture data only.

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
    sourceUrl: null,
    ...over,
  };
}

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

function measure(id: string, over: Partial<Measure> = {}): Measure {
  return {
    id,
    authority: "IEEPA",
    ch99Code: "9903.01.10",
    htsPrefixes: ["6109"],
    excludedPrefixes: [],
    originCountries: ["MX"],
    rateType: "ad_valorem",
    rateValue: "25",
    appliesToModes: ["postal", "express", "ocean", "air"],
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceUrl: `https://example.test/${id}`,
    ...over,
  };
}

function program(symbol: string, over: Partial<Program> = {}): Program {
  return {
    symbol,
    countries: ["MX", "CA"],
    mpfExempt: true,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceUrl: `https://example.test/gn-${symbol}`,
    ...over,
  };
}

function line(over: Partial<CostLine> = {}): CostLine {
  return {
    id: "l1",
    code: "6109.10.00.12",
    origin: "IN",
    value: "1000.00",
    quantity: 1,
    generalRate: parseRate("5.3%"),
    codeStatus: "confirmed",
    ...over,
  };
}

function run(over: Partial<LandedCostInput> = {}) {
  return landedCost({
    lines: [line()],
    shipment: {
      mode: "express",
      entryDate: "2026-06-15",
      currency: "USD",
      fxRateToUsd: "1",
      column2Countries: ["CU", "KP"],
    },
    measures: [],
    fees: FEES,
    ...over,
  });
}

const amountOf = (r: ReturnType<typeof run>, kind: string, i = 0) =>
  r.lines[i].components.filter((c) => c.kind === kind).map((c) => c.amount);
const shipFee = (r: ReturnType<typeof run>, kind: string) =>
  r.shipmentFees.find((c) => c.kind === kind)?.amount;
const usmca = (over: Partial<CostLine> = {}) =>
  line({
    origin: "MX",
    specialRates: parseSpecialRates("Free (A+,AU,S)")!,
    claimedProgram: "S",
    ...over,
  });

describe("special programs", () => {
  it("a clean confirmed line is ok and adds up", () => {
    const r = run();
    expect(r.status).toBe("ok");
    expect(r.lines[0].landedCost).toBe("1055.62");
  });

  it("'A+' (least-developed countries only) is refused without eligibility data", () => {
    const r = run({
      lines: [
        line({
          specialRates: parseSpecialRates("Free (A+,AU)")!,
          claimedProgram: "A",
        }),
      ],
    });
    expect(amountOf(r, "duty_general")).toEqual(["53.00"]);
    expect(r.lines[0].status).toBe("needs_review");
  });

  it("'A+' applies when the data lists the origin", () => {
    const r = run({
      lines: [
        line({
          origin: "NP",
          specialRates: parseSpecialRates("Free (A+,AU)")!,
          claimedProgram: "A",
        }),
      ],
      programs: [program("A+", { countries: ["NP"], mpfExempt: false })],
    });
    expect(amountOf(r, "duty_special")).toEqual(["0.00"]);
    expect(r.status).toBe("ok");
  });

  it("'A*' (some origins excluded on this line) uses the general rate and needs review", () => {
    for (const claimedProgram of ["A", "A*", "A+"]) {
      const r = run({
        lines: [
          line({
            specialRates: parseSpecialRates("Free (A*,AU)")!,
            claimedProgram,
          }),
        ],
        programs: [program("A*", { countries: ["IN"] })],
      });
      expect(amountOf(r, "duty_general")).toEqual(["53.00"]);
      expect(r.lines[0].status).toBe("needs_review");
    }
  });

  it("a bilateral agreement only applies to goods from that country", () => {
    const r = run({
      lines: [
        line({
          origin: "IN",
          specialRates: parseSpecialRates("Free (AU,KR)")!,
          claimedProgram: "AU",
        }),
      ],
    });
    expect(amountOf(r, "duty_general")).toEqual(["53.00"]);
    expect(r.lines[0].status).toBe("needs_review");
    expect(r.lines[0].warnings.join(" ")).toMatch(/AU.*IN/);
  });

  it("an origin outside the program's country list is refused", () => {
    const r = run({
      lines: [usmca({ origin: "GT" })],
      programs: [program("S")],
    });
    expect(amountOf(r, "duty_general")).toEqual(["53.00"]);
    expect(r.lines[0].status).toBe("needs_review");
  });

  it("a program without eligibility data is refused", () => {
    const r = run({ lines: [usmca()] });
    expect(amountOf(r, "duty_general")).toEqual(["53.00"]);
    expect(r.lines[0].warnings.join(" ")).toMatch(/eligibility data.*S/);
    expect(r.lines[0].status).toBe("needs_review");
  });

  it("a bilateral agreement without data leaves the MPF exemption to review", () => {
    const r = run({
      lines: [
        line({
          origin: "AU",
          specialRates: parseSpecialRates("Free (AU)")!,
          claimedProgram: "AU",
        }),
      ],
    });
    expect(amountOf(r, "duty_special")).toEqual(["0.00"]);
    expect(shipFee(r, "mpf")).toBe("2.62");
    expect(r.status).toBe("needs_review");
  });
});

describe("a qualifying claim on a line whose Special column does not list it", () => {
  const freeLine = (over: Partial<CostLine> = {}) =>
    line({
      origin: "MX",
      generalRate: parseRate("Free"),
      claimedProgram: "S",
      ...over,
    });

  it("pays the General rate but keeps the overlay and MPF exemptions", () => {
    const r = run({
      lines: [freeLine()],
      programs: [program("S")],
      measures: [measure("m1", { exemptPrograms: ["S"] })],
    });
    expect(amountOf(r, "duty_general")).toEqual(["0.00"]);
    expect(amountOf(r, "overlay")).toEqual([]);
    expect(shipFee(r, "mpf")).toBe("0.00");
    expect(r.status).toBe("ok");
  });

  it("is refused when the origin does not qualify", () => {
    const r = run({
      lines: [freeLine({ origin: "GT" })],
      programs: [program("S")],
      measures: [
        measure("m1", { originCountries: ["GT"], exemptPrograms: ["S"] }),
      ],
    });
    expect(amountOf(r, "overlay")).toEqual(["250.00"]);
    expect(shipFee(r, "mpf")).toBe("2.62");
    expect(r.status).toBe("needs_review");
  });

  it("is refused without eligibility data", () => {
    const r = run({ lines: [freeLine()] });
    expect(r.status).toBe("needs_review");
  });
});

describe("MPF exemption for qualifying goods", () => {
  it("an entry of only exempt goods pays no MPF", () => {
    const r = run({
      lines: [usmca({ value: "5000.00" })],
      programs: [program("S")],
    });
    expect(r.entryType).toBe("formal");
    expect(shipFee(r, "mpf")).toBe("0.00");
    expect(r.status).toBe("ok");
  });

  it("a mixed entry pays MPF on the other goods only, and needs review", () => {
    const r = run({
      lines: [
        usmca({ id: "mx", value: "5000.00" }),
        line({ id: "in", value: "50000.00" }),
      ],
      programs: [program("S")],
    });
    expect(shipFee(r, "mpf")).toBe("173.20"); // 0.3464% of 50,000
    expect(r.lines.map((l) => l.allocatedFees)).toEqual(["0.00", "173.20"]);
    expect(r.status).toBe("needs_review");
  });

  it("a program that is not MPF-exempt pays MPF as usual", () => {
    const r = run({
      lines: [usmca({ value: "5000.00" })],
      programs: [program("S", { mpfExempt: false })],
    });
    expect(shipFee(r, "mpf")).toBe("32.71");
    expect(r.status).toBe("ok");
  });
});

describe("overlay exemptions by program", () => {
  it("a measure that exempts the program is not charged", () => {
    const r = run({
      lines: [usmca()],
      programs: [program("S")],
      measures: [measure("m1", { exemptPrograms: ["S"] })],
    });
    expect(amountOf(r, "overlay")).toEqual([]);
    expect(r.status).toBe("ok");
  });

  it("an exemption for 'S+' does not cover a plain 'S' claim, but 'S' covers 'S+'", () => {
    const plus = (claim: string, exempt: string) =>
      run({
        lines: [
          usmca({
            specialRates: parseSpecialRates("Free (S,S+)")!,
            claimedProgram: claim,
          }),
        ],
        programs: [program("S"), program("S+")],
        measures: [measure("m1", { exemptPrograms: [exempt] })],
      });
    expect(amountOf(plus("S", "S+"), "overlay")).toEqual(["250.00"]);
    expect(amountOf(plus("S+", "S"), "overlay")).toEqual([]);
  });

  it("a measure that lists other exemptions is charged", () => {
    const r = run({
      lines: [usmca()],
      programs: [program("S")],
      measures: [measure("m1", { exemptPrograms: [] })],
    });
    expect(amountOf(r, "overlay")).toEqual(["250.00"]);
    expect(r.status).toBe("ok");
  });

  it("a measure with no exemption data is charged and needs review", () => {
    const r = run({
      lines: [usmca()],
      programs: [program("S")],
      measures: [measure("m1")],
    });
    expect(amountOf(r, "overlay")).toEqual(["250.00"]);
    expect(r.lines[0].status).toBe("needs_review");
  });

  it("lines without a program are charged without review", () => {
    const r = run({
      lines: [line({ origin: "MX" })],
      measures: [measure("m1")],
    });
    expect(amountOf(r, "overlay")).toEqual(["250.00"]);
    expect(r.status).toBe("ok");
  });
});

describe("data problems go to review", () => {
  it("a code with no status counts as suggested", () => {
    const r = run({ lines: [line({ codeStatus: undefined })] });
    expect(r.lines[0].warnings.join(" ")).toMatch(/suggested code/i);
  });

  it("a specific-rate measure has no unit, so it is not added and needs review", () => {
    const r = run({
      lines: [line({ origin: "MX" })],
      measures: [measure("m1", { rateType: "specific", rateValue: "1" })],
    });
    expect(amountOf(r, "overlay")).toEqual([]);
    expect(r.lines[0].status).toBe("needs_review");
  });

  it("two equally specific fee rows in force need review", () => {
    const r = run({
      fees: [
        ...FEES,
        fee("mpf-informal-2", "mpf_informal", { flatAmount: "2.69" }),
      ],
    });
    expect(r.status).toBe("needs_review");
    expect(r.warnings.join(" ")).toMatch(/mpf-informal/);
  });

  it("a missing informal entry limit needs review", () => {
    const r = run({
      fees: FEES.filter((f) => f.feeType !== "informal_entry_limit"),
    });
    expect(r.entryType).toBe("formal");
    expect(r.status).toBe("needs_review");
  });

  it("a missing MPF row needs review", () => {
    const r = run({ fees: FEES.filter((f) => f.feeType !== "mpf_informal") });
    expect(shipFee(r, "mpf")).toBeUndefined();
    expect(r.status).toBe("needs_review");
  });

  it("ocean without an HMF row needs review", () => {
    const r = run({
      fees: FEES.filter((f) => f.feeType !== "hmf"),
      shipment: {
        mode: "ocean",
        entryDate: "2026-06-15",
        currency: "USD",
        fxRateToUsd: "1",
        column2Countries: [],
      },
    });
    expect(r.status).toBe("needs_review");
  });

  it("a named carrier without a fee row is mentioned", () => {
    const r = run({
      shipment: {
        mode: "express",
        entryDate: "2026-06-15",
        currency: "USD",
        fxRateToUsd: "1",
        carrier: "UPS",
        column2Countries: [],
      },
    });
    expect(shipFee(r, "carrier_fee")).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/UPS/);
  });

  it("measure prefixes written with dots match the code", () => {
    const r = run({
      lines: [line({ origin: "MX" })],
      measures: [measure("m1", { htsPrefixes: ["6109.10"] })],
    });
    expect(amountOf(r, "overlay")).toEqual(["250.00"]);
  });
});

describe("invalid input throws", () => {
  const throws = (over: Partial<LandedCostInput>, pattern: RegExp) =>
    expect(() => run(over)).toThrow(pattern);

  it("rejects bad lines", () => {
    throws({ lines: [] }, /lines/);
    throws({ lines: [line({ code: "61091000" })] }, /HTS code/);
    throws({ lines: [line({ code: "abc" })] }, /HTS code/);
    throws({ lines: [line({ code: "6109-10-0012" })] }, /HTS code/);
    throws({ lines: [line({ origin: "india" })] }, /origin/);
    throws({ lines: [line({ quantity: 1.5 })] }, /quantity/);
    throws({ lines: [line({ quantities: { kg: "-1" } })] }, /kg quantity/);
  });

  it("rejects a bad shipment", () => {
    const shipment = {
      mode: "express" as const,
      entryDate: "2026-06-15",
      currency: "USD",
      fxRateToUsd: "1",
      column2Countries: [],
    };
    throws({ shipment: { ...shipment, fxRateToUsd: "1.1" } }, /exchange rate/);
    throws({ shipment: { ...shipment, currency: "usd" } }, /currency/);
    throws({ shipment: { ...shipment, mode: "Air" as never } }, /mode/);
    throws(
      { shipment: { ...shipment, column2Countries: null as never } },
      /Column 2/,
    );
  });

  it("rejects bad fee rows", () => {
    const bad = (over: Partial<Fee>) =>
      throws({ fees: [...FEES, fee("bad", "hmf", over)] }, /fee bad/);
    bad({ pct: "abc" });
    bad({ pct: "0.1", mode: "Air" as never });
    bad({ pct: null, flatAmount: null });
    bad({ pct: "1", minAmount: "10", maxAmount: "5" });
    bad({ pct: "1", effectiveTo: "2026-13-01" });
    throws(
      { fees: [...FEES, fee("bad", "nope" as never, { pct: "1" })] },
      /fee bad/,
    );
    throws(
      { fees: [fee("bad", "informal_entry_limit", { pct: "1" })] },
      /fee bad/,
    );
  });

  it("rejects bad measures", () => {
    const bad = (over: Partial<Measure>) =>
      throws({ measures: [measure("bad", over)] }, /measure bad/);
    bad({ effectiveFrom: "2026-02-30" });
    bad({ rateType: "percent" as never });
    bad({ rateValue: "25%" });
    bad({ excludedPrefixes: null as never });
    bad({ appliesToModes: null as never });
    bad({ appliesToModes: ["Air" as never] });
    bad({ originCountries: ["China"] });
    bad({ htsPrefixes: [] });
    bad({ htsPrefixes: ["61%"] });
  });

  it("rejects reference data that is not a list", () => {
    throws({ measures: null as never }, /measures/);
    throws({ fees: {} as never }, /fees/);
    throws({ programs: "S" as never }, /programs/);
  });

  it("rejects bad program rows", () => {
    throws({ programs: [program("usmca")] }, /program symbol/);
    throws(
      { programs: [program("S", { countries: ["Mexico"] })] },
      /program S/,
    );
  });
});
