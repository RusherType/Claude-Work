import { describe, expect, it } from "vitest";
import { COUNTRIES, COUNTRY_CODES, isCountryCode } from "./countries";

describe("countries", () => {
  it("has every code once, as two uppercase letters, with a display name", () => {
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
    expect(COUNTRY_CODES.length).toBeGreaterThan(240);
    for (const c of COUNTRY_CODES) expect(c).toMatch(/^[A-Z]{2}$/);
    expect(COUNTRIES.find((c) => c.code === "IN")?.name).toBe("India");
  });

  it("validates codes", () => {
    expect(isCountryCode("GB")).toBe(true);
    expect(isCountryCode("UK")).toBe(false);
    expect(isCountryCode("gb")).toBe(false);
  });
});
