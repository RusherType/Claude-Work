import "server-only";
import { cookies } from "next/headers";
import { isRole, type Role } from "@/lib/auth/roles";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookies";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

// The selected workspace is a cookie, but it is only a preference: every read re-checks the
// user's memberships, and RLS scopes every query to workspaces the user belongs to.
const WORKSPACE_COOKIE = "cd_ws";

export type WorkspaceSummary = { id: string; name: string; role: Role };
export type WorkspaceContext = {
  user: { id: string; email: string | null };
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
};

export async function listMyWorkspaces(
  userId: string,
): Promise<WorkspaceSummary[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("memberships")
    .select("role, workspaces!inner(id, name, deleted_at)")
    .eq("user_id", userId);
  if (error || !data) return [];
  return data
    .filter((m) => m.workspaces && !m.workspaces.deleted_at && isRole(m.role))
    .map((m) => ({
      id: m.workspaces.id,
      name: m.workspaces.name,
      role: m.role as Role,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The signed-in user and their current workspace, or null when either is missing. */
export async function getWorkspaceContext(): Promise<
  | WorkspaceContext
  | {
      user: { id: string; email: string | null };
      workspace: null;
      workspaces: [];
    }
  | null
> {
  const user = await getCurrentUser();
  if (!user) return null;
  const workspaces = await listMyWorkspaces(user.id);
  if (workspaces.length === 0) return { user, workspace: null, workspaces: [] };
  const selected = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const workspace = workspaces.find((w) => w.id === selected) ?? workspaces[0];
  return { user, workspace, workspaces };
}

/** Remember the selected workspace (Server Actions and Route Handlers only). */
export async function selectWorkspace(workspaceId: string | null) {
  const store = await cookies();
  if (!workspaceId) {
    store.delete(WORKSPACE_COOKIE);
    return;
  }
  store.set(WORKSPACE_COOKIE, workspaceId, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 365,
  });
}
