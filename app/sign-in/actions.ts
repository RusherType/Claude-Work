"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth/redirect";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

const emailInput = z.object({
  email: z.email("Enter a valid email address").max(254),
  next: z.string().max(2048).optional(),
});

async function callbackUrl(next: string | undefined) {
  const url = new URL("/auth/callback", await getSiteUrl());
  url.searchParams.set("next", safeNextPath(next));
  return url.toString();
}

export async function sendMagicLink(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = emailInput.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the email address" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: await callbackUrl(parsed.data.next) },
  });
  if (error) {
    return {
      status: "error",
      message: "We couldn't send the link. Wait a minute and try again.",
      email: parsed.data.email,
    };
  }
  return { status: "sent", email: parsed.data.email };
}

const oauthInput = z.object({ next: z.string().max(2048).optional() });

export async function signInWithGoogle(formData: FormData) {
  const { next } = oauthInput.parse({ next: formData.get("next") ?? undefined });
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await callbackUrl(next) },
  });
  if (error || !data.url) redirect("/sign-in?error=google");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
