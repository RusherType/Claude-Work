import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import products · ClearDuty" };

export default async function ImportPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/sign-in?next=/app/catalog/import");
  if (!ctx.workspace) redirect("/app");
  const { workspace } = ctx;
  const canImport = workspace.role !== "viewer";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Import products</h1>
        <p className="text-muted mt-1 text-sm">
          Add or update products in {workspace.name} from a CSV file. Imported
          products have no tariff code yet; classification comes next.
        </p>
      </div>
      {canImport ? (
        <ImportWizard workspaceId={workspace.id} />
      ) : (
        <div className="border-border bg-surface rounded-lg border p-6 text-sm">
          <p>
            Viewers can&apos;t import products. Ask an owner or admin to change
            your role.
          </p>
          <Link href="/app" className="text-brand mt-3 inline-block underline">
            Back to dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
