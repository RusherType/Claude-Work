import { describe, expect, it } from "vitest";
import {
  ROLES,
  canChangeRole,
  canManageTeam,
  canRemove,
  invitableRoles,
  isOwner,
  isRole,
  type Role,
} from "./roles";

describe("isRole", () => {
  it("accepts the four roles only", () => {
    for (const r of ROLES) expect(isRole(r)).toBe(true);
    for (const v of ["Owner", "superadmin", "", null, 1])
      expect(isRole(v)).toBe(false);
  });
});

describe("canManageTeam / isOwner", () => {
  it.each<[Role, boolean, boolean]>([
    ["owner", true, true],
    ["admin", true, false],
    ["member", false, false],
    ["viewer", false, false],
  ])("%s", (role, manage, owner) => {
    expect(canManageTeam(role)).toBe(manage);
    expect(isOwner(role)).toBe(owner);
  });
});

describe("invitableRoles", () => {
  it("lets owners invite any role, admins any but owner, others none", () => {
    expect(invitableRoles("owner")).toEqual([
      "owner",
      "admin",
      "member",
      "viewer",
    ]);
    expect(invitableRoles("admin")).toEqual(["admin", "member", "viewer"]);
    expect(invitableRoles("member")).toEqual([]);
    expect(invitableRoles("viewer")).toEqual([]);
  });
});

describe("canChangeRole", () => {
  it.each<[Role, Role, Role, boolean]>([
    ["owner", "member", "owner", true],
    ["owner", "owner", "admin", true],
    ["admin", "member", "admin", true],
    ["admin", "viewer", "member", true],
    ["admin", "member", "owner", false],
    ["admin", "owner", "admin", false],
    ["member", "viewer", "member", false],
    ["viewer", "viewer", "member", false],
    ["owner", "admin", "admin", false],
  ])("%s changing %s to %s -> %s", (actor, from, to, ok) => {
    expect(canChangeRole(actor, from, to)).toBe(ok);
  });
});

describe("canRemove", () => {
  it.each<[Role, Role, boolean]>([
    ["owner", "owner", true],
    ["owner", "viewer", true],
    ["admin", "member", true],
    ["admin", "admin", true],
    ["admin", "owner", false],
    ["member", "viewer", false],
    ["viewer", "viewer", false],
  ])("%s removing %s -> %s", (actor, target, ok) => {
    expect(canRemove(actor, target)).toBe(ok);
  });
});

describe("leaving", () => {
  it("lets every role remove themselves", () => {
    for (const r of ROLES) expect(canRemove(r, r, true)).toBe(true);
  });
});
