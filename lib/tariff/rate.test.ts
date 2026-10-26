import { describe, expect, it } from "vitest";
import {
  centsToDollars,
  parseRate,
  parseSpecialRates,
  specialRateFor,
  type ParsedRate,
} from "./rate";

const av = (percent: string) => ({ type: "ad_valorem", percent }) as const;
const sp = (amountUsd: string, unit: string) =>
  ({ type: "specific", amountUsd, unit }) as const;
const rate = (...components: object[]): ParsedRate =>
  ({ kind: "rate", components }) as ParsedRate;

describe("centsToDollars", () => {
  it.each([
    ["2.4", "0.024"],
    ["25", "0.25"],
    ["100", "1"],
    ["0.5", "0.005"],
    ["150", "1.5"],
    ["0.020668", "0.00020668"],
    ["7", "0.07"],
    ["1234.5", "12.345"],
  ])("%s¢ is $%s", (cents, dollars) => {
    expect(centsToDollars(cents)).toBe(dollars);
  });
});

describe("parseRate — free and empty", () => {
  it.each([
    "Free",
    "free",
    "FREE",
    " Free ",
    "Free.",
    "Free 1/",
    "Free 1/ 2/",
    "Free ",
  ])("%j is free", (raw) => {
    expect(parseRate(raw)).toEqual({ kind: "free" });
  });

  it.each(["", "   ", null, undefined])("%j is empty", (raw) => {
    expect(parseRate(raw)).toEqual({ kind: "empty" });
  });
});

describe("parseRate — ad valorem", () => {
  it.each([
    ["5.3%", "5.3"],
    ["25%", "25"],
    ["0%", "0"],
    ["6.25%", "6.25"],
    ["5.30%", "5.3"],
    ["5.3 %", "5.3"],
    [".5%", "0.5"],
    ["35%", "35"],
    ["16.5% 1/", "16.5"],
  ])("%s", (raw, percent) => {
    expect(parseRate(raw)).toEqual(rate(av(percent)));
  });
});

describe("parseRate — specific", () => {
  it.each([
    ["2.4¢/kg", "0.024", "kg"],
    ["2.4 ¢ / kg", "0.024", "kg"],
    ["$1.035/kg", "1.035", "kg"],
    ["$1/kg", "1", "kg"],
    ["1.5¢/liter", "0.015", "liter"],
    ["$1.04/pf. liter", "1.04", "proof_liter"],
    ["68¢/head", "0.68", "head"],
    ["$1.10/doz.", "1.1", "dozen"],
    ["15¢/doz. pr.", "0.15", "dozen_pairs"],
    ["37.5¢/pr.", "0.375", "pair"],
    ["51¢ each", "0.51", "each"],
    ["0.9¢/No.", "0.009", "each"],
    ["13.2¢/m2", "0.132", "m2"],
    ["$1.06/1000", "1.06", "thousand"],
    ["2.2¢/clean kg", "0.022", "kg"],
    ["4.4¢/gross", "0.044", "gross"],
  ])("%s", (raw, amount, unit) => {
    expect(parseRate(raw)).toEqual(rate(sp(amount, unit)));
  });
});

describe("parseRate — compound", () => {
  it("cents per kg plus percent", () => {
    expect(parseRate("25¢/kg + 3.4%")).toEqual(
      rate(sp("0.25", "kg"), av("3.4")),
    );
  });

  it("dollars per kg plus percent", () => {
    expect(parseRate("$3.40/kg + 13.6%")).toEqual(
      rate(sp("3.4", "kg"), av("13.6")),
    );
  });

  it("keeps component order", () => {
    expect(parseRate("6% + 4.4¢/kg")).toEqual(rate(av("6"), sp("0.044", "kg")));
  });

  it("three components", () => {
    expect(parseRate("1¢/kg + 2¢/liter + 3%")).toEqual(
      rate(sp("0.01", "kg"), sp("0.02", "liter"), av("3")),
    );
  });

  it("each plus percent", () => {
    expect(parseRate("10¢ each + 6%")).toEqual(
      rate(sp("0.1", "each"), av("6")),
    );
  });

  it("tolerates missing spaces around +", () => {
    expect(parseRate("1.4¢/kg+2.8%")).toEqual(
      rate(sp("0.014", "kg"), av("2.8")),
    );
  });
});

describe("parseRate — complex text is never guessed", () => {
  it.each([
    "0.9¢/kg less 0.020668¢/kg for each degree under 100 degrees",
    "37.5¢/kg on drained weight",
    "4.2% but not less than 1.6¢/kg",
    "The rate applicable to the article of which it is a part",
    "5% (on the value of the textile)",
    "51¢ each + 6.25% on the case + 5.3% on the strap",
    "2.5¢/kg on total sugars",
    "3¢/bushel",
    "See 9902.01.01",
    "abc",
    "5.3% + ",
  ])("%j", (raw) => {
    const parsed = parseRate(raw);
    expect(parsed.kind).toBe("complex");
    if (parsed.kind === "complex") {
      expect(parsed.raw).toBe(raw.trim());
      expect(parsed.reason).toBeTruthy();
    }
  });
});

describe("parseSpecialRates", () => {
  it("one free group with programs", () => {
    expect(parseSpecialRates("Free (A+,AU,BH,CA,CL)")).toEqual([
      { rate: { kind: "free" }, programs: ["A+", "AU", "BH", "CA", "CL"] },
    ]);
  });

  it("several groups", () => {
    expect(parseSpecialRates("Free (A*,AU,KR) 2.8% (JP)")).toEqual([
      { rate: { kind: "free" }, programs: ["A*", "AU", "KR"] },
      { rate: rate(av("2.8")), programs: ["JP"] },
    ]);
  });

  it("compound special rate", () => {
    expect(parseSpecialRates("Free (CA,MX) 1.2¢/kg + 2% (JO)")).toEqual([
      { rate: { kind: "free" }, programs: ["CA", "MX"] },
      { rate: rate(sp("0.012", "kg"), av("2")), programs: ["JO"] },
    ]);
  });

  it("tolerates spaces inside the program list", () => {
    expect(parseSpecialRates("Free (A, AU , E)")[0].programs).toEqual([
      "A",
      "AU",
      "E",
    ]);
  });

  it("empty special column", () => {
    expect(parseSpecialRates("")).toEqual([]);
    expect(parseSpecialRates(null)).toEqual([]);
  });

  it("unparsed leftovers make the whole cell complex", () => {
    const groups = parseSpecialRates("Free (CA) and something else");
    expect(groups).toHaveLength(1);
    expect(groups[0].rate.kind).toBe("complex");
  });

  it("finds the rate for a program, case-insensitively", () => {
    const groups = parseSpecialRates("Free (A+,AU,KR) 2.8% (JP)");
    expect(specialRateFor(groups, "jp")).toEqual(rate(av("2.8")));
    expect(specialRateFor(groups, "KR")).toEqual({ kind: "free" });
    expect(specialRateFor(groups, "MX")).toBeNull();
  });
});
