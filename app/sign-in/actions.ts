"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNext } from "@/lib/auth/redirect";
import { googleAuthEnabled, siteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

const emailSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  next: z.string().max(2048).optional(),
});

async function callbackUrl(next: string) {
  // Prefer the configured site URL; fall back to the request origin (checked by Next against Host
  // for Server Actions, and by Supabase's redirect allow list).
  let base = siteUrl();
  if (!base && process.env.NODE_ENV === "production") return null;
  if (!base) {
    const origin = z.url().safeParse((await headers()).get("origin"));
    if (!origin.success || !/^https?:/.test(origin.data)) return null;
    base = origin.data;
  }
  return `${base}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;
}

export async function sendMagicLink(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check your email.",
    };
  }
  const supabase = await createClient();
  const redirectTo = await callbackUrl(parsed.data.next ?? "");
  if (!supabase || !redirectTo) {
    return {
      status: "error",
      message: "Sign-in isn't available right now. Try again shortly.",
    };
  }
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  if (error) {
    return {
      status: "error",
      message:
        error.status === 429
          ? "Too many sign-in emails. Wait a minute and try again."
          : "We couldn't send the email. Check the address and try again.",
    };
  }
  return { status: "sent", email: parsed.data.email };
}

const googleSchema = z.object({ next: z.string().max(2048).optional() });

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const parsed = googleSchema.safeParse({
    next: formData.get("next") ?? undefined,
  });
  const next = parsed.success ? (parsed.data.next ?? "") : "";
  const supabase = await createClient();
  const redirectTo = await callbackUrl(next);
  if (!googleAuthEnabled() || !supabase || !redirectTo)
    redirect("/sign-in?error=google");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error || !data.url) redirect("/sign-in?error=google");
  redirect(data.url);
}
