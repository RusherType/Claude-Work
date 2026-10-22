"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManageMember, assignableRoles, invitableRoles, ROLES } from "@/lib/auth/roles";
import { sendInviteEmail } from "@/lib/email/send-invite";
import { getSiteUrl } from "@/lib/site-url";
import { ForbiddenError, requireRole } from "@/lib/workspace/current";
import { generateInviteToken } from "@/lib/workspace/invite-token";

export type InviteState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "created"; email: string; link: string; emailed: boolean };

export type ActionResult = { ok: true } | { ok: false; message: string };

const TEAM_PATH = "/app/settings/team";

function failure(error: unknown, fallback: string): { ok: false; message: string } {
  if (error instanceof ForbiddenError) return { ok: false, message: error.message };
  if (error instanceof z.ZodError) return { ok: false, message: error.issues[0]?.message ?? fallback };
  return { ok: false, message: fallback };
}

const inviteInput = z.object({
  workspaceId: z.uuid(),
  email: z.email("Enter a valid email address").max(254),
  role: z.enum(["admin", "member", "viewer"]),
});

export async function inviteMember(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const parsed = inviteInput.safeParse({
    workspaceId: formData.get("workspaceId"),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    role: formData.get("role"),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form" };
  const { workspaceId, email, role } = parsed.data;

  try {
    const { supabase, user, role: actorRole } = await requireRole(workspaceId, "manage_team");
    if (!invitableRoles(actorRole).includes(role)) throw new ForbiddenError();

    const { data: members } = await supabase.rpc("workspace_members", { ws: workspaceId });
    if (members?.some((m) => m.email?.toLowerCase() === email)) {
      return { status: "error", message: `${email} is already in this workspace.` };
    }

    // A new invite replaces any open one for the same address
    await supabase
      .from("invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("email", email)
      .is("accepted_at", null)
      .is("revoked_at", null);

    const { token, hash } = generateInviteToken();
    const { error } = await supabase.from("invitations").insert({
      workspace_id: workspaceId,
      email,
      role,
      token_hash: hash,
      invited_by: user.id,
    });
    if (error) return { status: "error", message: "We couldn't create the invite. Try again." };

    const { data: ws } = await supabase.from("workspaces").select("name").eq("id", workspaceId).single();
    const link = new URL(`/invite/${token}`, await getSiteUrl()).toString();
    const emailed = await sendInviteEmail({
      to: email,
      workspaceName: ws?.name ?? "a workspace",
      inviterEmail: user.email ?? "A teammate",
      link,
    }).catch(() => false);

    revalidatePath(TEAM_PATH);
    return { status: "created", email, link, emailed };
  } catch (error) {
    return { status: "error", message: failure(error, "We couldn't create the invite.").message };
  }
}

const revokeInput = z.object({ workspaceId: z.uuid(), invitationId: z.uuid() });

export async function revokeInvite(input: z.input<typeof revokeInput>): Promise<ActionResult> {
  try {
    const { workspaceId, invitationId } = revokeInput.parse(input);
    const { supabase } = await requireRole(workspaceId, "manage_team");
    const { error } = await supabase
      .from("invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", invitationId)
      .eq("workspace_id", workspaceId);
    if (error) return { ok: false, message: "We couldn't revoke the invite." };
    revalidatePath(TEAM_PATH);
    return { ok: true };
  } catch (error) {
    return failure(error, "We couldn't revoke the invite.");
  }
}

const memberInput = z.object({ workspaceId: z.uuid(), userId: z.uuid() });
const roleInput = memberInput.extend({ role: z.enum(ROLES) });

async function targetRole(workspaceId: string, userId: string) {
  const { supabase, user, role } = await requireRole(workspaceId, "manage_team");
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new ForbiddenError("That person is not in this workspace.");
  if (!canManageMember(role, data.role)) throw new ForbiddenError("Admins can't change an owner.");
  return { supabase, user, actorRole: role, current: data.role };
}

export async function changeRole(input: z.input<typeof roleInput>): Promise<ActionResult> {
  try {
    const { workspaceId, userId, role } = roleInput.parse(input);
    const { supabase, user, actorRole, current } = await targetRole(workspaceId, userId);
    if (!assignableRoles(actorRole).includes(role)) throw new ForbiddenError("You can't give that role.");
    if (current === role) return { ok: true };

    const { error } = await supabase
      .from("memberships")
      .update({ role })
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId);
    if (error) {
      return {
        ok: false,
        message: error.message.includes("at least one owner")
          ? "A workspace needs at least one owner. Make someone else an owner first."
          : "We couldn't change the role.",
      };
    }
    await supabase.from("audit_log").insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      action: "member.role_changed",
      entity: "membership",
      entity_id: userId,
      data: { from: current, to: role },
    });
    revalidatePath(TEAM_PATH);
    return { ok: true };
  } catch (error) {
    return failure(error, "We couldn't change the role.");
  }
}

export async function removeMember(input: z.input<typeof memberInput>): Promise<ActionResult> {
  try {
    const { workspaceId, userId } = memberInput.parse(input);
    const { supabase, user, current } = await targetRole(workspaceId, userId);
    const { error } = await supabase
      .from("memberships")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId);
    if (error) {
      return {
        ok: false,
        message: error.message.includes("at least one owner")
          ? "A workspace needs at least one owner."
          : "We couldn't remove that person.",
      };
    }
    await supabase.from("audit_log").insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      action: "member.removed",
      entity: "membership",
      entity_id: userId,
      data: { role: current },
    });
    revalidatePath(TEAM_PATH);
    return { ok: true };
  } catch (error) {
    return failure(error, "We couldn't remove that person.");
  }
}
