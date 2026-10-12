"use server";

import { revalidatePath } from "next/cache";
import { importBatchSchema } from "@/lib/catalog/import";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { listMyWorkspaces } from "@/lib/workspace";

// CD-022: one batch of already-checked rows per call. The browser checks every row first; this
// re-validates the whole batch with the same schema, and the database (RLS plus import_products)
// is the real enforcement.

export type BatchResult =
  | { status: "ok"; inserted: number; updated: number; unchanged: number }
  | { status: "error"; message: string };

const WRITE_ROLES = new Set(["owner", "admin", "member"]);

function errorMessage(error: { code?: string; message?: string }): string {
  switch (error.code) {
    case "42501":
      return "You don't have permission to import products into this workspace.";
    case "23505":
      return "Some SKUs were saved by someone else at the same time. Run the import again; existing SKUs are updated, not duplicated.";
    case "23514":
    case "22001":
    case "23502":
      return "Some rows have values the catalog does not accept. Check the file and try again.";
    default:
      return "The import stopped because of a problem on our side. Try again.";
  }
}

export async function importProductBatch(input: unknown): Promise<BatchResult> {
  const parsed = importBatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message:
        "Some rows have values the catalog does not accept. Check the file and try again.",
    };
  }
  const user = await getCurrentUser();
  if (!user)
    return {
      status: "error",
      message: "Your session has ended. Sign in again.",
    };
  const workspace = (await listMyWorkspaces(user.id)).find(
    (w) => w.id === parsed.data.workspaceId,
  );
  if (!workspace || !WRITE_ROLES.has(workspace.role)) {
    return { status: "error", message: errorMessage({ code: "42501" }) };
  }

  const supabase = await createClient();
  if (!supabase) return { status: "error", message: errorMessage({}) };
  const { data, error } = await supabase.rpc("import_products", {
    p_workspace_id: workspace.id,
    p_rows: parsed.data.rows,
  });
  if (error || !data?.[0])
    return { status: "error", message: errorMessage(error ?? {}) };
  revalidatePath("/app", "layout");
  return { status: "ok", ...data[0] };
}
