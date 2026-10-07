import { describe, expect, it } from "vitest";
import {
  centsToUsd,
  normalizeDecimal,
  parseRate,
  parseSpecialRates,
  type ParsedRate,
} from "./rate";

const av = (percent: string) => ({ kind: "ad_valorem" as const, percent });
const sp = (usd: string, unit: string) => ({
  kind: "specific" as const,
  usd,
  unit,
});
const rate = (...components: ReturnType<typeof av | typeof sp>[]): ParsedRate =>
  ({ type: "rate", components }) as ParsedRate;

describe("normalizeDecimal", () => {
  it.each([
    ["5.30", "5.3"],
    ["05", "5"],
    [".5", "0.5"],
    ["0", "0"],
    ["10.0", "10"],
  ])("%s -> %s", (input, out) => expect(normalizeDecimal(input)).toBe(out));
});

describe("centsToUsd is exact", () => {
  it.each([
    ["2.4", "0.024"],
    ["25", "0.25"],
    ["0.5", "0.005"],
    ["150", "1.5"],
    ["0.020668", "0.00020668"],
    ["100", "1"],
  ])("%s¢ -> $%s", (cents, usd) => expect(centsToUsd(cents)).toBe(usd));
});

describe("parseRate: simple forms", () => {
  it.each<[string, ParsedRate]>([
    ["Free", { type: "free" }],
    ["free", { type: "free" }],
    [" Free ", { type: "free" }],
    ["", { type: "none" }],
    ["   ", { type: "none" }],
    ["5.3%", rate(av("5.3"))],
    ["16.5%", rate(av("16.5"))],
    ["35%", rate(av("35"))],
    ["0.9%", rate(av("0.9"))],
    ["6.50%", rate(av("6.5"))],
    ["2.4¢/kg", rate(sp("0.024", "kg"))],
    ["4.4¢/liter", rate(sp("0.044", "liter"))],
    ["$1.35/kg", rate(sp("1.35", "kg"))],
    ["$2.20/kg", rate(sp("2.2", "kg"))],
    ["0.5¢/kg", rate(sp("0.005", "kg"))],
  ])("%j", (input, expected) => expect(parseRate(input)).toEqual(expected));

  it("treats null and undefined as no rate", () => {
    expect(parseRate(null)).toEqual({ type: "none" });
    expect(parseRate(undefined)).toEqual({ type: "none" });
  });
});

describe("parseRate: units", () => {
  it.each([
    ["$1.035/pr.", "1.035", "pair"],
    ["15¢/doz.", "0.15", "dozen"],
    ["$1.08/doz. pr.", "1.08", "dozen_pairs"],
    ["5¢/no.", "0.05", "each"],
    ["$1.07/1000", "1.07", "thousand"],
    ["$5.14/pf. liter", "5.14", "proof_liter"],
    ["$5.14/proof liter", "5.14", "proof_liter"],
    ["3.6¢/m²", "0.036", "m2"],
    ["$1/head", "1", "head"],
    ["21¢/gross", "0.21", "gross"],
    ["10.5¢/bbl.", "0.105", "barrel"],
    ["$1.10/t", "1.1", "t"],
  ])("%s", (input, usd, unit) =>
    expect(parseRate(input)).toEqual(rate(sp(usd, unit))),
  );

  it("reads 'each' written after the amount", () => {
    expect(parseRate("$0.45 each")).toEqual(rate(sp("0.45", "each")));
    expect(parseRate("4.4¢ each")).toEqual(rate(sp("0.044", "each")));
  });
});

describe("parseRate: compound rates", () => {
  it.each<[string, ParsedRate]>([
    ["25¢/kg + 3.4%", rate(sp("0.25", "kg"), av("3.4"))],
    ["3.4% + 25¢/kg", rate(av("3.4"), sp("0.25", "kg"))],
    ["$1.21/kg + 16.6%", rate(sp("1.21", "kg"), av("16.6"))],
    ["35¢/doz. + 2.3%", rate(sp("0.35", "dozen"), av("2.3"))],
    ["6%+$0.45 each", rate(av("6"), sp("0.45", "each"))],
    ["10.4¢/kg + 2.8%", rate(sp("0.104", "kg"), av("2.8"))],
  ])("%j", (input, expected) => expect(parseRate(input)).toEqual(expected));

  it("keeps a quantity basis such as drained weight", () => {
    expect(parseRate("37.5¢/kg on drained weight")).toEqual({
      type: "rate",
      components: [sp("0.375", "kg")],
      basis: "on drained weight",
    });
    expect(parseRate("45¢/kg on contents and container")).toEqual({
      type: "rate",
      components: [sp("0.45", "kg")],
      basis: "on contents and container",
    });
  });
});

describe("parseRate: text it must not guess", () => {
  it.each([
    "1.6¢/kg less 0.020668¢/kg for each degree under 100 degrees (and fractions of a degree) but not less than 1.1¢/kg",
    "The rate applicable to the article of which it is a part",
    "2.4% on the value of the bottle",
    "5% + 3%",
    "33¢/kg but not less than 2%",
    "4¢/furlong",
    "See subheading 9903.88.03",
    "5.3",
  ])("%s is complex", (input) => {
    expect(parseRate(input)).toEqual({ type: "complex", raw: input });
  });
});

describe("parseRate: input clean-up", () => {
  it("handles non-breaking spaces and footnote marks", () => {
    expect(parseRate("25¢/kg + 3.4%")).toEqual(
      rate(sp("0.25", "kg"), av("3.4")),
    );
    expect(parseRate("Free¹")).toEqual({ type: "free" });
    expect(parseRate("5.3%⁴")).toEqual(rate(av("5.3")));
    expect(parseRate("5.3%²")).toEqual(rate(av("5.3")));
  });

  it("keeps the superscripts in m² and m³ units", () => {
    expect(parseRate("$1.20/m³")).toEqual(rate(sp("1.2", "m3")));
  });
});

describe("parseSpecialRates", () => {
  it("reads one program group", () => {
    expect(
      parseSpecialRates(
        "Free (A+,AU,BH,CL,CO,D,E,IL,JO,KR,MA,OM,P,PA,PE,S,SG)",
      ),
    ).toEqual([
      {
        rate: { type: "free" },
        programs: [
          "A+",
          "AU",
          "BH",
          "CL",
          "CO",
          "D",
          "E",
          "IL",
          "JO",
          "KR",
          "MA",
          "OM",
          "P",
          "PA",
          "PE",
          "S",
          "SG",
        ],
      },
    ]);
  });

  it("reads several groups with different rates", () => {
    expect(
      parseSpecialRates("Free (A*,AU,BH) 2.1% (JP) 25¢/kg + 1% (KR)"),
    ).toEqual([
      { rate: { type: "free" }, programs: ["A*", "AU", "BH"] },
      { rate: rate(av("2.1")), programs: ["JP"] },
      { rate: rate(sp("0.25", "kg"), av("1")), programs: ["KR"] },
    ]);
  });

  it("returns an empty list for a blank cell", () => {
    expect(parseSpecialRates("")).toEqual([]);
    expect(parseSpecialRates(null)).toEqual([]);
  });

  it("returns null for text that is not program groups", () => {
    expect(parseSpecialRates("Free")).toBeNull();
    expect(parseSpecialRates("Free (AU) see note 3")).toBeNull();
    expect(parseSpecialRates("Free ()")).toBeNull();
  });
});
