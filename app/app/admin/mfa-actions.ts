"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isPlatformAdmin } from "@/lib/admin/access";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

// CD-014: second factor (TOTP) for platform admins. Runs on the server because the session
// cookies are HTTP-only; a successful verify upgrades the session to aal2.

export type EnrollState =
  | { status: "idle" }
  | { status: "enrolled"; factorId: string; qr: string; secret: string }
  | { status: "error"; message: string };
export type VerifyState =
  { status: "idle" } | { status: "error"; message: string };

const GENERIC = "Something went wrong. Try again.";

async function adminClient() {
  const user = await getCurrentUser();
  if (!user || !(await isPlatformAdmin(user.id))) return null;
  return createClient();
}

export async function startEnrollment(): Promise<EnrollState> {
  const supabase = await adminClient();
  if (!supabase) return { status: "error", message: "Admins only." };
  const factors = await supabase.auth.mfa.listFactors();
  if ((factors.data?.totp ?? []).some((f) => f.status === "verified")) {
    return {
      status: "error",
      message: "An authenticator is already set up. Enter its code.",
    };
  }
  // Start over cleanly if an earlier setup was abandoned.
  for (const f of factors.data?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "ClearDuty admin",
  });
  if (error || !data) return { status: "error", message: GENERIC };
  return {
    status: "enrolled",
    factorId: data.id,
    qr: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

const verifySchema = z.object({
  factorId: z.uuid().optional(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app."),
});

export async function verifyCode(
  _prev: VerifyState,
  form: FormData,
): Promise<VerifyState> {
  const parsed = verifySchema.safeParse({
    factorId: form.get("factorId") || undefined,
    code: form.get("code"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  const supabase = await adminClient();
  if (!supabase) return { status: "error", message: "Admins only." };
  const factors = (await supabase.auth.mfa.listFactors()).data?.all ?? [];
  // Only the user's own TOTP factors: the posted id must be one of them.
  const factor = parsed.data.factorId
    ? factors.find(
        (f) => f.id === parsed.data.factorId && f.factor_type === "totp",
      )
    : factors.find((f) => f.factor_type === "totp" && f.status === "verified");
  if (!factor)
    return { status: "error", message: "Set up your authenticator first." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: parsed.data.code,
  });
  if (error) {
    return {
      status: "error",
      message:
        "That code didn't work. Check your device's clock and try the newest code.",
    };
  }
  redirect("/app/admin");
}
