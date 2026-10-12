import { describe, expect, it } from "vitest";
import { totp } from "./totp";

describe("totp", () => {
  // RFC 6238 appendix B test vectors (SHA-1 seed "12345678901234567890"), last 6 digits.
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("at %i s gives %s", (seconds, code) => {
    expect(totp(secret, seconds * 1000)).toBe(code);
  });
});
