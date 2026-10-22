"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { WORKSPACE_COOKIE, requireUser } from "@/lib/workspace/current";
import { INVITE_TOKEN_PATTERN } from "@/lib/workspace/invite-token";

export type AcceptState = { status: "idle" | "error"; message?: string };

const input = z.object({ token: z.string().regex(INVITE_TOKEN_PATTERN) });

export async function acceptInvite(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const parsed = input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "This invitation link is not valid." };

  const { supabase } = await requireUser(`/invite/${parsed.data.token}`);
  const { data: workspaceId, error } = await supabase.rpc("accept_invitation", { p_token: parsed.data.token });
  if (error || !workspaceId) {
    // Only accept_invitation()'s own errors (expired, used, wrong email) are written for people
    const readable = error && ["P0002", "42501"].includes(error.code ?? "");
    return { status: "error", message: readable ? error.message : "This invitation is invalid or has expired." };
  }

  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/app");
}
