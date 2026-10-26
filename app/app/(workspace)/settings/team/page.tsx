import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ROLE_LABELS,
  assignableRoles,
  can,
  canManageMember,
  invitableRoles,
} from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace, requireUser } from "@/lib/workspace/current";
import { InviteForm } from "./invite-form";
import { MemberControls, RevokeInviteButton } from "./member-controls";

export const metadata: Metadata = { title: "Team — ClearDuty" };

export default async function TeamPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) redirect("/app/onboarding");
  const { user } = await requireUser();
  const supabase = await createClient();
  const manage = can(workspace.role, "manage_team");

  const [{ data: members, error }, { data: invites }] = await Promise.all([
    supabase.rpc("workspace_members", { ws: workspace.id }),
    manage
      ? supabase
          .from("invitations")
          .select("id, email, role, expires_at")
          .eq("workspace_id", workspace.id)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  if (error) throw error;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-muted text-sm">
          People who can see and work on {workspace.name}.
        </p>
      </div>

      {manage && (
        <section
          aria-labelledby="invite-heading"
          className="border-border bg-surface rounded-lg border p-5"
        >
          <h2 id="invite-heading" className="font-semibold">
            Invite someone
          </h2>
          <InviteForm
            workspaceId={workspace.id}
            roles={invitableRoles(workspace.role)}
          />
        </section>
      )}

      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="mb-3 font-semibold">
          Members ({members?.length ?? 0})
        </h2>
        <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
          {members?.map((m) => {
            const isSelf = m.user_id === user.id;
            const editable =
              manage && !isSelf && canManageMember(workspace.role, m.role);
            return (
              <li
                key={m.user_id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {m.full_name || m.email}{" "}
                    {isSelf && (
                      <span className="text-muted font-normal">(you)</span>
                    )}
                  </p>
                  {m.full_name && (
                    <p className="text-muted truncate text-xs">{m.email}</p>
                  )}
                </div>
                {editable ? (
                  <MemberControls
                    workspaceId={workspace.id}
                    userId={m.user_id}
                    label={m.email ?? "member"}
                    role={m.role}
                    roles={assignableRoles(workspace.role)}
                  />
                ) : (
                  <span className="text-muted">{ROLE_LABELS[m.role]}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {manage && (
        <section aria-labelledby="pending-heading">
          <h2 id="pending-heading" className="mb-3 font-semibold">
            Pending invites
          </h2>
          {invites && invites.length > 0 ? (
            <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
              {invites.map((i) => (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{i.email}</span>
                  <span className="text-muted">{ROLE_LABELS[i.role]}</span>
                  <span className="text-muted text-xs">
                    expires{" "}
                    {new Date(i.expires_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <RevokeInviteButton
                    workspaceId={workspace.id}
                    invitationId={i.id}
                    email={i.email}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-sm">No pending invites.</p>
          )}
        </section>
      )}
    </div>
  );
}
