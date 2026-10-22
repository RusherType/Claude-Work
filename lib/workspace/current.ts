import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { can, type Action, type Role } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export const WORKSPACE_COOKIE = "cd_ws";

export type WorkspaceMembership = { id: string; name: string; role: Role };

/** The signed-in user, or a redirect to sign-in. */
export async function requireUser(next = "/app") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return { supabase, user };
}

export async function listWorkspaces(): Promise<WorkspaceMembership[]> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, workspaces!inner(id, name, deleted_at)")
    .eq("user_id", user.id)
    .is("workspaces.deleted_at", null);
  if (error) throw error;
  return data
    .map((m) => ({ id: m.workspaces.id, name: m.workspaces.name, role: m.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The workspace picked in the switcher (cookie), else the first one; null if the user has none. */
export async function getCurrentWorkspace(): Promise<WorkspaceMembership | null> {
  const workspaces = await listWorkspaces();
  const chosen = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  return workspaces.find((w) => w.id === chosen) ?? workspaces[0] ?? null;
}

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that in this workspace.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Server-action guard: the caller's role in `workspaceId`, if it allows `action`.
 * Throws ForbiddenError otherwise. RLS still applies to every query after this.
 */
export async function requireRole(workspaceId: string, action: Action) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data || !can(data.role, action)) throw new ForbiddenError();
  return { supabase, user, role: data.role };
}
