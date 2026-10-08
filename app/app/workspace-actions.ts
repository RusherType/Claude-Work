"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  canChangeRole,
  canRemove,
  invitableRoles,
  ROLES,
} from "@/lib/auth/roles";
import { isCountryCode } from "@/lib/countries";
import { siteUrl } from "@/lib/env";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { listMyWorkspaces, selectWorkspace } from "@/lib/workspace";
import { GENERIC_ERROR, workspaceErrorMessage } from "@/lib/workspace-errors";

// Every action validates input with Zod, checks the role here for a clear message, and relies on
// the database (RLS, grants and the CD-004 functions) as the real enforcement.

export type ActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; message?: string; link?: string };

const err = (message: string): ActionState => ({ status: "error", message });
const forbidden = () => err(workspaceErrorMessage({ message: "forbidden" }));
const TEAM_PATH = "/app/settings/team";

/**
 * The signed-in user and their role in the workspace the form was shown for. Forms post the
 * workspace id explicitly, so a stale tab can never act on a different selected workspace.
 */
async function actorIn(workspaceId: unknown) {
  const id = z.uuid().safeParse(workspaceId);
  const user = await getCurrentUser();
  if (!id.success || !user) return null;
  const workspace = (await listMyWorkspaces(user.id)).find(
    (w) => w.id === id.data,
  );
  return workspace ? { user, workspace } : null;
}

// ---------- Create and switch ----------

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a workspace name.")
    .max(120, "Use 120 characters or fewer."),
  homeCountry: z
    .string({ error: "Choose a home country." })
    .refine(isCountryCode, "Choose a home country."),
  businessType: z.enum(["dtc_to_us", "importer", "both"], {
    error: "Choose what you do.",
  }),
});

export async function createWorkspace(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    homeCountry: formData.get("homeCountry"),
    businessType: formData.get("businessType"),
  });
  if (!parsed.success)
    return err(parsed.error.issues[0]?.message ?? GENERIC_ERROR);
  const supabase = await createClient();
  if (!supabase) return err(GENERIC_ERROR);
  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: parsed.data.name,
    p_home_country: parsed.data.homeCountry,
    p_business_type: parsed.data.businessType,
  });
  if (error || !data) return err(workspaceErrorMessage(error));
  await selectWorkspace(data);
  redirect("/app");
}

export async function switchWorkspace(formData: FormData): Promise<void> {
  const actor = await actorIn(formData.get("workspaceId"));
  if (actor) await selectWorkspace(actor.workspace.id);
  redirect("/app");
}

// ---------- Invitations ----------

const inviteSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  role: z.enum(ROLES, { error: "Choose a role." }),
});

async function inviteBaseUrl(): Promise<string | null> {
  const base = siteUrl();
  if (base) return base;
  if (process.env.NODE_ENV === "production") return null;
  const origin = z.url().safeParse((await headers()).get("origin"));
  return origin.success && /^https?:/.test(origin.data) ? origin.data : null;
}

export async function inviteMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success)
    return err(parsed.error.issues[0]?.message ?? GENERIC_ERROR);
  const ctx = await actorIn(formData.get("workspaceId"));
  if (!ctx) return forbidden();
  if (!invitableRoles(ctx.workspace.role).includes(parsed.data.role)) {
    return err(
      parsed.data.role === "owner"
        ? workspaceErrorMessage({ message: "only_owners_invite_owners" })
        : workspaceErrorMessage({ message: "forbidden" }),
    );
  }
  const base = await inviteBaseUrl();
  const supabase = await createClient();
  if (!supabase || !base) return err(GENERIC_ERROR);
  const { data: token, error } = await supabase.rpc("create_invitation", {
    p_workspace: ctx.workspace.id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error || !token) return err(workspaceErrorMessage(error));
  revalidatePath(TEAM_PATH);
  // Email delivery arrives with Resend (Phase 4); until then the inviter shares this link.
  return {
    status: "ok",
    message: `Invitation created for ${parsed.data.email.toLowerCase()}.`,
    link: `${base}/invite/${token}`,
  };
}

export async function revokeInvitation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = z.uuid().safeParse(formData.get("invitationId"));
  if (!id.success) return err(GENERIC_ERROR);
  const supabase = await createClient();
  if (!supabase) return err(GENERIC_ERROR);
  const { error } = await supabase.rpc("revoke_invitation", {
    p_invitation: id.data,
  });
  if (error) return err(workspaceErrorMessage(error));
  revalidatePath(TEAM_PATH);
  return { status: "ok", message: "Invitation revoked." };
}

const acceptSchema = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) });

export async function acceptInvitation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = acceptSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success)
    return err(workspaceErrorMessage({ message: "invitation_invalid" }));
  const supabase = await createClient();
  if (!supabase) return err(GENERIC_ERROR);
  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token: parsed.data.token,
  });
  if (error || !data) return err(workspaceErrorMessage(error));
  await selectWorkspace(data);
  redirect("/app");
}

// ---------- Members ----------

const memberSchema = z.object({ userId: z.uuid() });
const roleSchema = memberSchema.extend({ role: z.enum(ROLES) });

async function memberRole(workspaceId: string, userId: string) {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.rpc("workspace_members", {
    p_workspace: workspaceId,
  });
  return data?.find((m) => m.user_id === userId)?.role ?? null;
}

export async function changeMemberRole(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = roleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return err(GENERIC_ERROR);
  const ctx = await actorIn(formData.get("workspaceId"));
  if (!ctx) return forbidden();
  const current = await memberRole(ctx.workspace.id, parsed.data.userId);
  if (
    !current ||
    !canChangeRole(ctx.workspace.role, current, parsed.data.role)
  ) {
    return forbidden();
  }
  const supabase = await createClient();
  if (!supabase) return err(GENERIC_ERROR);
  const { data, error } = await supabase
    .from("memberships")
    .update({ role: parsed.data.role })
    .eq("workspace_id", ctx.workspace.id)
    .eq("user_id", parsed.data.userId)
    .select("user_id");
  if (error) return err(workspaceErrorMessage(error));
  if (!data?.length) return forbidden();
  revalidatePath(TEAM_PATH);
  return { status: "ok", message: "Role updated." };
}

export async function removeMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = memberSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return err(GENERIC_ERROR);
  const ctx = await actorIn(formData.get("workspaceId"));
  if (!ctx) return forbidden();
  const isSelf = parsed.data.userId === ctx.user.id;
  const target = await memberRole(ctx.workspace.id, parsed.data.userId);
  if (!target || !canRemove(ctx.workspace.role, target, isSelf))
    return forbidden();
  const supabase = await createClient();
  if (!supabase) return err(GENERIC_ERROR);
  const { data, error } = await supabase
    .from("memberships")
    .delete()
    .eq("workspace_id", ctx.workspace.id)
    .eq("user_id", parsed.data.userId)
    .select("user_id");
  if (error) return err(workspaceErrorMessage(error));
  if (!data?.length) return forbidden();
  if (isSelf) {
    await selectWorkspace(null);
    redirect("/app");
  }
  revalidatePath(TEAM_PATH);
  return { status: "ok", message: "Removed from the workspace." };
}
