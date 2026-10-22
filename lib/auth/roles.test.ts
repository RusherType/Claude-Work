import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  can,
  canManageMember,
  invitableRoles,
  type Action,
  type Role,
} from "./roles";

// Rows of the table in docs/03-security.md
const table: [Action, Role[]][] = [
  ["view", ["owner", "admin", "member", "viewer"]],
  ["classify", ["owner", "admin", "member"]],
  ["confirm_code", ["owner", "admin", "member"]],
  ["order_broker", ["owner", "admin"]],
  ["manage_integrations", ["owner", "admin"]],
  ["manage_team", ["owner", "admin"]],
  ["manage_billing", ["owner"]],
  ["delete_workspace", ["owner"]],
];

describe("can", () => {
  for (const [action, allowed] of table) {
    for (const role of ["owner", "admin", "member", "viewer"] as Role[]) {
      it(`${role} ${allowed.includes(role) ? "may" : "may not"} ${action}`, () => {
        expect(can(role, action)).toBe(allowed.includes(role));
      });
    }
  }

  it("denies a missing role", () => {
    expect(can(null, "view")).toBe(false);
    expect(can(undefined, "view")).toBe(false);
  });
});

describe("team management", () => {
  it("owners may assign any role, admins never owner", () => {
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("admin")).not.toContain("owner");
    expect(assignableRoles("member")).toEqual([]);
    expect(assignableRoles("viewer")).toEqual([]);
  });

  it("nobody is invited as owner", () => {
    expect(invitableRoles("owner")).not.toContain("owner");
    expect(invitableRoles("admin")).toEqual(["admin", "member", "viewer"]);
  });

  it("admins cannot manage owners", () => {
    expect(canManageMember("owner", "owner")).toBe(true);
    expect(canManageMember("admin", "owner")).toBe(false);
    expect(canManageMember("admin", "admin")).toBe(true);
    expect(canManageMember("member", "viewer")).toBe(false);
  });
});
