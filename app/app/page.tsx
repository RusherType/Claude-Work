import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { COUNTRIES } from "@/lib/countries";
import { getWorkspaceContext } from "@/lib/workspace";
import { CreateWorkspaceForm } from "./create-workspace-form";

export const metadata: Metadata = { title: "Dashboard · ClearDuty" };

export default async function AppHome() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/sign-in?next=/app");

  // Empty state: a new user creates their first workspace (onboarding step 1, docs/05 Flow A).
  if (!ctx.workspace) {
    return (
      <section className="border-border bg-surface flex flex-col gap-4 rounded-lg border p-6">
        <div>
          <h1 className="text-xl font-semibold">Create your workspace</h1>
          <p className="text-muted mt-1 text-sm">
            A workspace holds your company&apos;s catalog, codes and team. If a
            teammate invited you, open the link from their invitation instead.
          </p>
        </div>
        <CreateWorkspaceForm countries={COUNTRIES} />
      </section>
    );
  }

  return (
    <section className="border-border bg-surface flex flex-col items-start gap-3 rounded-lg border p-6">
      <p className="text-muted text-sm">
        {ROLE_LABELS[ctx.workspace.role]} · {ctx.workspace.name}
      </p>
      <h1 className="text-xl font-semibold">Welcome to {ctx.workspace.name}</h1>
      <p className="text-muted text-sm">
        Start by importing your products from a CSV file. You can also invite
        your team.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        {ctx.workspace.role !== "viewer" && (
          <Link
            href="/app/catalog/import"
            className="bg-brand dark:text-background rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            Import products
          </Link>
        )}
        <Link
          href="/app/catalog"
          className="text-brand text-sm font-medium underline"
        >
          View catalog
        </Link>
        <Link
          href="/app/settings/team"
          className="text-brand text-sm font-medium underline"
        >
          Manage team
        </Link>
      </div>
    </section>
  );
}
