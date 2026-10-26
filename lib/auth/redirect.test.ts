import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it.each(["/app", "/app/catalog?status=suggested", "/invite/abc"])(
    "keeps %s",
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    null,
    undefined,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "app",
    "/app\n",
    "javascript:alert(1)",
  ])("falls back for %j", (path) => {
    expect(safeNextPath(path)).toBe("/app");
  });
});
