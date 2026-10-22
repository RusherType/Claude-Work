"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { COUNTRY_CODES } from "@/lib/countries";
import { WORKSPACE_COOKIE, listWorkspaces, requireUser } from "@/lib/workspace/current";

export type FormState = { status: "idle" | "error"; message?: string };

const cookieOptions = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" } as const;

const createInput = z.object({
  name: z.string().trim().min(1, "Enter your company name").max(80, "Use 80 characters or fewer"),
  homeCountry: z.enum(COUNTRY_CODES as [string, ...string[]], { error: "Pick your home country" }),
  businessType: z.enum(["dtc_to_us", "importer", "both"], { error: "Pick how you sell" }),
});

export async function createWorkspace(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };

  const { supabase } = await requireUser();
  const { data: workspaceId, error } = await supabase.rpc("create_workspace", {
    p_name: parsed.data.name,
    p_home_country: parsed.data.homeCountry,
    p_business_type: parsed.data.businessType,
  });
  if (error || !workspaceId) {
    return { status: "error", message: "We couldn't create the workspace. Try again." };
  }

  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, cookieOptions);
  redirect("/app");
}

const switchInput = z.object({ workspaceId: z.uuid() });

export async function switchWorkspace(formData: FormData) {
  const { workspaceId } = switchInput.parse(Object.fromEntries(formData));
  const workspaces = await listWorkspaces();
  if (workspaces.some((w) => w.id === workspaceId)) {
    (await cookies()).set(WORKSPACE_COOKIE, workspaceId, cookieOptions);
  }
  redirect("/app");
}
