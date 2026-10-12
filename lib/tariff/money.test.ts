import { describe, expect, it } from "vitest";
import { allocate, dec, Decimal, formatUsd, isoDate, usd } from "./money";

const d = (s: string) => new Decimal(s);

describe("dec", () => {
  it("accepts plain non-negative decimals", () => {
    expect(dec("1000.00", "value").toString()).toBe("1000");
    expect(dec(".5", "value").toString()).toBe("0.5");
  });

  it.each(["1,000", "-1", "1e3", "", " 1", "NaN", "Infinity", "1."])(
    "rejects %j",
    (s) => {
      expect(() => dec(s, "value")).toThrow(/Invalid value/);
    },
  );

  it("rejects non-strings", () => {
    expect(() => dec(10, "value")).toThrow(/Invalid value/);
  });
});

describe("isoDate", () => {
  it("accepts real dates", () => {
    expect(isoDate("2028-02-29", "date")).toBe("2028-02-29");
  });

  it.each(["2026-02-30", "2026-13-01", "15/06/2026", "2026-6-1", ""])(
    "rejects %j",
    (s) => {
      expect(() => isoDate(s, "entry date")).toThrow(/entry date/);
    },
  );
});

describe("usd and formatUsd", () => {
  it("rounds half up to the cent", () => {
    expect(usd(d("0.005"))).toBe("0.01");
    expect(usd(d("0.0049"))).toBe("0.00");
    expect(usd(d("2.675"))).toBe("2.68"); // a float would give 2.67
  });

  it("formats thousands", () => {
    expect(formatUsd(d("1234567.8"))).toBe("$1,234,567.80");
    expect(formatUsd(d("0"))).toBe("$0.00");
  });
});

describe("allocate", () => {
  const split = (total: string, weights: string[]) =>
    allocate(d(total), weights.map(d)).map((x) => x.toFixed(2));

  it("splits by weight and sums exactly", () => {
    expect(split("2.62", ["600", "400"])).toEqual(["1.57", "1.05"]);
    expect(split("1.00", ["1", "1", "1"])).toEqual(["0.34", "0.33", "0.33"]);
  });

  it("gives leftover cents to the largest remainders, ties to the earliest", () => {
    expect(split("0.05", ["1", "1", "1", "1"])).toEqual([
      "0.02",
      "0.01",
      "0.01",
      "0.01",
    ]);
    expect(split("0.10", ["1", "2"])).toEqual(["0.03", "0.07"]);
  });

  it("splits evenly when every weight is zero", () => {
    expect(split("0.03", ["0", "0"])).toEqual(["0.02", "0.01"]);
  });

  it("gives everything to the only weighted line", () => {
    expect(split("5.00", ["0", "10"])).toEqual(["0.00", "5.00"]);
  });

  it("handles no lines and a zero total", () => {
    expect(split("1.00", [])).toEqual([]);
    expect(split("0.00", ["1", "2"])).toEqual(["0.00", "0.00"]);
  });
});
