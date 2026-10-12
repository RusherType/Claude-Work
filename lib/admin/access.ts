import "server-only";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

// CD-014: who may use /app/admin. The database enforces the same rule on every write
// (is_platform_admin_mfa); this decides what to render.

export type AdminAccess =
  | { status: "signed_out" }
  | { status: "not_admin" }
  /** A platform admin whose session has no second factor yet. */
  | { status: "needs_mfa"; hasFactor: boolean }
  | { status: "ok"; userId: string };

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient();
  if (!supabase) return false;
  const { data } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", userId)
    .maybeSingle();
  return data?.is_platform_admin === true;
}

export async function adminAccess(): Promise<AdminAccess> {
  const user = await getCurrentUser();
  if (!user) return { status: "signed_out" };
  if (!(await isPlatformAdmin(user.id))) return { status: "not_admin" };
  if (user.aal !== "aal2") {
    const supabase = await createClient();
    const factors = await supabase?.auth.mfa.listFactors();
    const hasFactor = (factors?.data?.totp ?? []).some(
      (f) => f.status === "verified",
    );
    return { status: "needs_mfa", hasFactor };
  }
  return { status: "ok", userId: user.id };
}
