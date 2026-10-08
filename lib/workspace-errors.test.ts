import { describe, expect, it } from "vitest";
import { GENERIC_ERROR, workspaceErrorMessage } from "./workspace-errors";

describe("workspaceErrorMessage", () => {
  it("maps function error codes to plain messages", () => {
    expect(
      workspaceErrorMessage({ message: "invitation_expired", code: "P0001" }),
    ).toMatch(/expired/);
    expect(
      workspaceErrorMessage({ message: "already_member", code: "22023" }),
    ).toMatch(/already/);
  });

  it("maps permission errors without leaking details", () => {
    expect(
      workspaceErrorMessage({
        message: "permission denied for table invitations",
        code: "42501",
      }),
    ).toMatch(/permission/);
  });

  it("maps the last-owner rule", () => {
    expect(
      workspaceErrorMessage({
        message: "A workspace must keep at least one owner",
        code: "23514",
      }),
    ).toMatch(/at least one owner/);
  });

  it("never echoes unknown database text", () => {
    expect(
      workspaceErrorMessage({
        message: 'relation "x" does not exist',
        code: "42P01",
      }),
    ).toBe(GENERIC_ERROR);
    expect(workspaceErrorMessage(null)).toBe(GENERIC_ERROR);
  });
});
