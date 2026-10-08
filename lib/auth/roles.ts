// Role rules from docs/03-security.md. The database enforces them too (RLS, column grants and the
// CD-004 functions); these helpers let server actions refuse early with a clear message and let
// pages show only the controls a role can use.

export const ROLES = ["owner", "admin", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export function isRole(value: unknown): value is Role {
  return (
    typeof value === "string" && (ROLES as readonly string[]).includes(value)
  );
}

/** Invite, remove and change roles of teammates. */
export function canManageTeam(actor: Role): boolean {
  return actor === "owner" || actor === "admin";
}

/** Roles `actor` may hand out in an invitation. Only owners create owners. */
export function invitableRoles(actor: Role): Role[] {
  if (actor === "owner") return [...ROLES];
  if (actor === "admin") return ["admin", "member", "viewer"];
  return [];
}

/** Whether `actor` may change a teammate from `from` to `to`. Admins never touch owners. */
export function canChangeRole(actor: Role, from: Role, to: Role): boolean {
  if (from === to) return false;
  if (actor === "owner") return true;
  if (actor === "admin") return from !== "owner" && to !== "owner";
  return false;
}

/** Whether `actor` may remove a teammate who has `target` role. */
export function canRemove(actor: Role, target: Role): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return target !== "owner";
  return false;
}

/** Billing, plan changes and deleting the workspace. */
export function isOwner(actor: Role): boolean {
  return actor === "owner";
}
