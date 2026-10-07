import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_SIGN_IN, isProtectedPath, safeNext } from "./redirect";

describe("safeNext", () => {
  it.each([
    ["/app", "/app"],
    ["/app/catalog?status=suggested", "/app/catalog?status=suggested"],
    ["/app/catalog?q=50%25", "/app/catalog?q=50%25"],
    ["/app#top", "/app#top"],
  ])("keeps same-site path %s", (input, out) =>
    expect(safeNext(input)).toBe(out),
  );

  it.each([
    null,
    undefined,
    "",
    "https://evil.example/app",
    "//evil.example",
    "/\\evil.example",
    "%2F%2Fevil.example",
    "javascript:alert(1)",
    "app",
    "/app\nSet-Cookie: x",
    "%E0%A4%A",
    // Dot segments that normalise into a protocol-relative URL.
    "/.//evil.example",
    "/app/..//evil.example/login",
    "/%2E//evil.example",
    "/./\\evil.example",
  ])("falls back to the default for %j", (input) => {
    expect(safeNext(input)).toBe(DEFAULT_AFTER_SIGN_IN);
  });
});

describe("isProtectedPath", () => {
  it.each([
    ["/app", true],
    ["/app/catalog", true],
    ["/apple", false],
    ["/", false],
    ["/sign-in", false],
  ])("%s -> %s", (path, out) => expect(isProtectedPath(path)).toBe(out));
});

describe("safeNext never leaves the site", () => {
  it.each([
    "/.//evil.example",
    "/x/..//evil.example",
    "/%2E//evil.example",
    "/app/..//evil.example/x",
    "/./%2Fevil.example",
    "/%2F/evil.example",
    "/%5Cevil.example",
    "/app/%2e%2e//evil.example",
  ])("%j", (input) => {
    const out = safeNext(input);
    expect(out.startsWith("//")).toBe(false);
    expect(new URL(out, "https://app.clearduty.test").origin).toBe(
      "https://app.clearduty.test",
    );
  });
});
