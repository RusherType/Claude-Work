"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNext } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";
import { selectWorkspace } from "@/lib/workspace";

/** Sign out, forget the selected workspace, and go to sign-in (optionally returning to `next`). */
export async function signOut(formData?: FormData): Promise<void> {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  await selectWorkspace(null);
  const next = z
    .string()
    .min(1)
    .max(2048)
    .optional()
    .safeParse(formData?.get("next") ?? undefined);
  if (next.success && next.data) {
    redirect(`/sign-in?next=${encodeURIComponent(safeNext(next.data))}`);
  }
  redirect("/sign-in");
}
