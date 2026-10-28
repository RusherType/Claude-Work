import { describe, expect, it } from "vitest";
import {
  citedRulings,
  confidenceSegments,
  isLowConfidence,
  readAlternatives,
  readCitations,
  readGriPath,
  rulingUrl,
} from "./result";

describe("readAlternatives", () => {
  it("keeps well-formed alternatives and drops the rest", () => {
    expect(
      readAlternatives([
        { code: "6109100040", why: "Not all white" },
        { code: "6109.10.0040", why: "Dotted codes are not stored" },
        { code: "6105100010", why: "  " },
        "6110",
        null,
      ]),
    ).toEqual([{ code: "6109100040", why: "Not all white" }]);
    expect(readAlternatives(null)).toEqual([]);
    expect(readAlternatives({ code: "6109100040" })).toEqual([]);
  });

  it("shows at most five", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      code: `610910004${i}`,
      why: `Reason ${i}`,
    }));
    expect(readAlternatives(many)).toHaveLength(5);
  });
});

describe("readCitations and citedRulings", () => {
  it("reads rulings and notes, and lists each ruling once", () => {
    const citations = readCitations([
      { kind: "ruling", number: "NY N123456", note: "space in number" },
      { kind: "ruling", number: "N123456", note: "Cotton T-shirt" },
      { kind: "ruling", number: "HQ0912345" },
      { kind: "ruling", number: "N123456" },
      { kind: "note", ref: "Chapter 61 note 9" },
      { kind: "url", href: "javascript:alert(1)" },
    ]);
    expect(citations).toEqual([
      { kind: "ruling", number: "N123456", note: "Cotton T-shirt" },
      { kind: "ruling", number: "HQ0912345" },
      { kind: "ruling", number: "N123456" },
      { kind: "note", ref: "Chapter 61 note 9" },
    ]);
    expect(citedRulings(citations)).toEqual(["N123456", "HQ0912345"]);
  });
});

describe("readGriPath", () => {
  it("keeps rule names only", () => {
    expect(readGriPath(["GRI 1", "GRI 3(b)", "GRI 6", "ignore me", 6])).toEqual(
      ["GRI 1", "GRI 3(b)", "GRI 6"],
    );
  });
});

describe("confidence", () => {
  it.each([
    [0, 0],
    [0.09, 0],
    [0.1, 1],
    [0.59, 3],
    [0.6, 3],
    [0.85, 4],
    [0.9, 5],
    [1, 5],
    [1.4, 5],
    [-1, 0],
    [Number.NaN, 0],
  ])("%s fills %s of 5 segments", (confidence, segments) => {
    expect(confidenceSegments(confidence)).toBe(segments);
  });

  it("is low below 0.6", () => {
    expect(isLowConfidence(0.59)).toBe(true);
    expect(isLowConfidence(0.6)).toBe(false);
  });
});

describe("rulingUrl", () => {
  it("allows https links to the CBP rulings site only", () => {
    expect(rulingUrl("https://rulings.cbp.gov/ruling/N123456")).toBe(
      "https://rulings.cbp.gov/ruling/N123456",
    );
    for (const bad of [
      "http://rulings.cbp.gov/ruling/N1",
      "https://rulings.cbp.gov.evil.example/ruling/N1",
      "https://evil.example/rulings.cbp.gov",
      "https://user:pw@rulings.cbp.gov/ruling/N1",
      "https://rulings.cbp.gov:8443/ruling/N1",
      "javascript:alert(1)",
      "data:text/html,x",
      "not a url",
      "",
      null,
      undefined,
    ])
      expect(rulingUrl(bad)).toBeNull();
  });
});
