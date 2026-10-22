/**
 * Workspace role matrix from docs/03-security.md. RLS enforces the same rules in the
 * database; this copy lets server actions fail early with a clear message and lets the
 * UI hide controls a role cannot use.
 */

export const ROLES = ["owner", "admin", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export type Action =
  | "view"
  | "classify"
  | "confirm_code"
  | "order_broker"
  | "manage_integrations"
  | "manage_team"
  | "manage_billing"
  | "delete_workspace";

const MATRIX: Record<Action, readonly Role[]> = {
  view: ["owner", "admin", "member", "viewer"],
  classify: ["owner", "admin", "member"],
  confirm_code: ["owner", "admin", "member"],
  order_broker: ["owner", "admin"],
  manage_integrations: ["owner", "admin"],
  manage_team: ["owner", "admin"],
  manage_billing: ["owner"],
  delete_workspace: ["owner"],
};

export function can(role: Role | null | undefined, action: Action): boolean {
  return !!role && MATRIX[action].includes(role);
}

/** Roles an actor may hand out by invite or role change. Nobody invites an owner. */
export function assignableRoles(actor: Role): Role[] {
  if (actor === "owner") return ["owner", "admin", "member", "viewer"];
  if (actor === "admin") return ["admin", "member", "viewer"];
  return [];
}

export function invitableRoles(actor: Role): Role[] {
  return assignableRoles(actor).filter((r) => r !== "owner");
}

/** Can `actor` change or remove a member who currently has `target`? Admins never touch owners. */
export function canManageMember(actor: Role, target: Role): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return target !== "owner";
  return false;
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};
