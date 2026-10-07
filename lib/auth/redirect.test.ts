import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_SIGN_IN, isProtectedPath, safeNext } from "./redirect";

describe("safeNext", () => {
  it.each([
    ["/app", "/app"],
    ["/app/catalog?status=suggested", "/app/catalog?status=suggested"],
    ["%2Fapp%2Freview", "/app/review"],
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
