import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { COUNTRIES } from "@/lib/countries";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { CreateWorkspaceForm } from "./create-workspace-form";

export const metadata: Metadata = {
  title: "Set up your workspace — ClearDuty",
};

export default async function OnboardingPage({
  searchParams,
}: PageProps<"/app/onboarding">) {
  const { new: wantsNew } = await searchParams;
  if (!wantsNew && (await getCurrentWorkspace())) redirect("/app");

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div>
        <p className="text-muted text-sm">Step 1 of 3</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Tell us about your company
        </h1>
        <p className="text-muted mt-1 text-sm">
          This creates your workspace. You can invite your team next.
        </p>
      </div>
      <CreateWorkspaceForm countries={COUNTRIES} />
    </div>
  );
}
