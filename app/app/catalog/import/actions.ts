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
  /** `retryable`: sending the same batch again may work (network, a concurrent import). */
  | { status: "error"; message: string; retryable: boolean };

const WRITE_ROLES = new Set(["owner", "admin", "member"]);
const REJECTED =
  "Some rows have values the catalog does not accept. Download the rows that were not imported, fix them and import that file.";

function failure(error: { code?: string }): BatchResult {
  switch (error.code) {
    case "42501":
      return {
        status: "error",
        retryable: false,
        message:
          "You don't have permission to import products into this workspace.",
      };
    case "23505":
      return {
        status: "error",
        retryable: true,
        message:
          "Someone saved some of these SKUs at the same time. Retry: existing SKUs are updated, not duplicated.",
      };
    case "23514":
    case "23502":
    case "22001":
    case "22003":
    case "22P02":
    case "22P05":
    case "22023":
      return { status: "error", retryable: false, message: REJECTED };
    default:
      return {
        status: "error",
        retryable: true,
        message: "The import stopped because of a problem on our side. Retry.",
      };
  }
}

export async function importProductBatch(input: unknown): Promise<BatchResult> {
  const parsed = importBatchSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", retryable: false, message: REJECTED };
  }
  const user = await getCurrentUser();
  if (!user) {
    return {
      status: "error",
      retryable: false,
      message:
        "Your session has ended. Sign in again, then import the remaining rows.",
    };
  }
  const workspace = (await listMyWorkspaces(user.id)).find(
    (w) => w.id === parsed.data.workspaceId,
  );
  if (!workspace || !WRITE_ROLES.has(workspace.role)) {
    return failure({ code: "42501" });
  }

  const supabase = await createClient();
  if (!supabase) return failure({});
  const { data, error } = await supabase.rpc("import_products", {
    p_workspace_id: workspace.id,
    p_rows: parsed.data.rows,
  });
  if (error || !data?.[0]) return failure(error ?? {});
  revalidatePath("/app", "layout");
  return { status: "ok", ...data[0] };
}
