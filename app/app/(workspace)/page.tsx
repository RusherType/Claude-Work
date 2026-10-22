import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { getCurrentWorkspace } from "@/lib/workspace/current";

export const metadata: Metadata = { title: "Dashboard — ClearDuty" };

export default async function DashboardPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) redirect("/app/onboarding");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{workspace.name}</h1>
        <p className="text-muted text-sm">You are {ROLE_LABELS[workspace.role].toLowerCase()} of this workspace.</p>
      </div>
      <section className="border-border bg-surface rounded-lg border p-8 text-center">
        <h2 className="font-semibold">No products yet</h2>
        <p className="text-muted mx-auto mt-1 max-w-md text-sm">
          Connect your Shopify store or upload a CSV and ClearDuty will suggest an HTS code for every
          product. Importing arrives with the catalog tickets.
        </p>
      </section>
    </div>
  );
}
