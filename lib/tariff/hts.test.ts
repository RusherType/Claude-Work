import { describe, expect, it } from "vitest";
import { formatHts, hsSubheading, normalizeHts } from "./hts";

describe("normalizeHts", () => {
  it("strips dots and spaces", () => {
    expect(normalizeHts("6109.10.0012")).toBe("6109100012");
    expect(normalizeHts(" 6109 10 ")).toBe("610910");
  });

  it("rejects wrong lengths and non-digits", () => {
    expect(normalizeHts("610")).toBeNull();
    expect(normalizeHts("61091")).toBeNull();
    expect(normalizeHts("6109.10.001A")).toBeNull();
    expect(normalizeHts("")).toBeNull();
  });
});

describe("formatHts", () => {
  it("formats every valid length", () => {
    expect(formatHts("6109")).toBe("6109");
    expect(formatHts("610910")).toBe("6109.10");
    expect(formatHts("61091000")).toBe("6109.10.00");
    expect(formatHts("6109100012")).toBe("6109.10.0012");
  });

  it("throws on invalid input", () => {
    expect(() => formatHts("abc")).toThrow();
  });
});

describe("hsSubheading", () => {
  it("returns the 6-digit HS subheading", () => {
    expect(hsSubheading("6109.10.0012")).toBe("610910");
  });

  it("throws on a 4-digit heading", () => {
    expect(() => hsSubheading("6109")).toThrow();
  });
});
