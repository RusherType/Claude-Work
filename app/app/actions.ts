"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";
import { selectWorkspace } from "@/lib/workspace";

/** Sign out, forget the selected workspace, and go to sign-in (optionally returning to `next`). */
export async function signOut(formData?: FormData): Promise<void> {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  await selectWorkspace(null);
  const next = formData?.get("next");
  if (typeof next === "string" && next) {
    redirect(`/sign-in?next=${encodeURIComponent(safeNext(next))}`);
  }
  redirect("/sign-in");
}
