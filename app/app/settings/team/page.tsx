import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ROLE_LABELS,
  canChangeRole,
  canManageTeam,
  canRemove,
  invitableRoles,
  isRole,
  ROLES,
} from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { InviteForm, MemberActions, RevokeInvitation } from "./team-forms";

export const metadata: Metadata = { title: "Team · ClearDuty" };

export default async function TeamPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/sign-in?next=/app/settings/team");
  if (!ctx.workspace) redirect("/app");
  const { workspace } = ctx;
  const supabase = await createClient();

  const { data: members, error } = await supabase!.rpc("workspace_members", {
    p_workspace: workspace.id,
  });
  if (error) throw new Error("Could not load team members");

  const manage = canManageTeam(workspace.role);
  const { data: invitations } = manage
    ? await supabase!
        .from("invitations")
        .select("id, email, role, expires_at")
        .eq("workspace_id", workspace.id)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Team</h1>
        <p className="text-muted mt-1 text-sm">
          People in {workspace.name}. You are{" "}
          {ROLE_LABELS[workspace.role].toLowerCase()}.
        </p>
      </div>

      <section aria-labelledby="members" className="flex flex-col gap-3">
        <h2 id="members" className="font-semibold">
          Members
        </h2>
        <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
          {(members ?? []).map((m) => {
            const role = isRole(m.role) ? m.role : "viewer";
            const roleOptions = ROLES.filter(
              (r) => r === role || canChangeRole(workspace.role, role, r),
            );
            return (
              <li
                key={m.user_id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.full_name || m.email}
                  </p>
                  <p className="text-muted truncate text-xs">
                    {m.email}
                    {m.user_id === ctx.user.id ? " · you" : ""}
                  </p>
                </div>
                <MemberActions
                  userId={m.user_id}
                  role={role}
                  roleOptions={roleOptions}
                  canChange={roleOptions.length > 1}
                  canRemove={canRemove(workspace.role, role)}
                  isSelf={m.user_id === ctx.user.id}
                />
              </li>
            );
          })}
        </ul>
      </section>

      {manage && (
        <section aria-labelledby="invite" className="flex flex-col gap-3">
          <h2 id="invite" className="font-semibold">
            Invite someone
          </h2>
          <InviteForm roles={invitableRoles(workspace.role)} />
          <h3 className="mt-2 text-sm font-semibold">Pending invitations</h3>
          {invitations && invitations.length > 0 ? (
            <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
              {invitations.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span>
                    {inv.email} ·{" "}
                    {isRole(inv.role) ? ROLE_LABELS[inv.role] : inv.role}
                    <span className="text-muted">
                      {" "}
                      · expires{" "}
                      {new Date(inv.expires_at).toLocaleDateString("en-GB")}
                    </span>
                  </span>
                  <RevokeInvitation invitationId={inv.id} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-sm">No pending invitations.</p>
          )}
        </section>
      )}
    </div>
  );
}
