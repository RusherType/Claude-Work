"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { readFacts } from "@/lib/catalog/facts";
import {
  changedColumns,
  editErrors,
  formToProductEdit,
  productEditSchema,
} from "@/lib/catalog/product-edit";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { listMyWorkspaces } from "@/lib/workspace";

// CD-024: save a product's details and facts. Zod validates the form; the role is checked here
// for a clear message; RLS and the products_outdated trigger are the real enforcement (a change
// to anything the code depends on marks a confirmed code Outdated).

export type SaveState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      errors?: Record<string, string>;
      /** What was submitted, so the form shows it again (React resets forms after actions). */
      values?: Record<string, string>;
      attempt?: number;
    };

const target = z.object({
  productId: z.uuid(),
  /** updated_at when the page was loaded: a save never overwrites someone else's newer edit. */
  version: z.string().min(1).max(64),
});
const WRITE_ROLES = new Set(["owner", "admin", "member"]);
const CONFIRMED = new Set(["confirmed", "broker_verified"]);
const FORM_FIELDS = new Set([
  "title",
  "description",
  "product_type",
  "vendor",
  "tags",
  "image_urls",
  "origin_country",
  "customs_value",
  "currency",
  "weight_kg",
  "function",
  "user",
  "form",
  "materials",
]);

function submitted(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("$ACTION") && typeof v === "string") out[k] = v;
  }
  return out;
}

export async function saveProduct(
  productId: string,
  version: string,
  _prev: SaveState,
  form: FormData,
): Promise<SaveState> {
  const fail = (
    message: string,
    errors?: Record<string, string>,
  ): SaveState => ({
    status: "error",
    message,
    errors,
    values: submitted(form),
    attempt: Date.now(),
  });
  const t = target.safeParse({ productId, version });
  if (!t.success) return fail("Unknown product.");

  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return fail("Your session has ended. Sign in again.");

  const current = await supabase
    .from("products")
    .select(
      "id, workspace_id, title, description, product_type, vendor, tags, image_urls, origin_country, customs_value::text, currency, weight_kg::text, facts",
    )
    .eq("id", t.data.productId)
    .maybeSingle();
  const product = current.data;
  if (current.error || !product) return fail("This product no longer exists.");
  const workspace = (await listMyWorkspaces(user.id)).find(
    (w) => w.id === product.workspace_id,
  );
  if (!workspace || !WRITE_ROLES.has(workspace.role)) {
    return fail(
      "Viewers can't change products. Ask an owner or admin to change your role.",
    );
  }

  // The agent's open questions are not on the form; keep them.
  const missing = readFacts(product.facts).missing;
  const parsed = productEditSchema.safeParse(formToProductEdit(form, missing));
  if (!parsed.success) {
    const errors = editErrors(parsed.error);
    // Anything not tied to a form field goes in the message, so it is never invisible.
    const other = Object.entries(errors)
      .filter(([k]) => !FORM_FIELDS.has(k) && !k.startsWith("material_"))
      .map(([, m]) => m);
    return fail(["Fix the highlighted fields.", ...other].join(" "), errors);
  }
  // Only what the person changed: untouched fields stored in another form must not change the
  // content hash (and so must not mark a confirmed code Outdated).
  const changes = changedColumns(parsed.data, product);
  if (Object.keys(changes).length === 0) {
    redirect(`/app/catalog/${t.data.productId}?saved=1`);
  }

  const before = await supabase
    .from("classifications")
    .select("status")
    .eq("product_id", t.data.productId)
    .eq("is_current", true)
    .eq("market", "US")
    .maybeSingle();

  const saved = await supabase
    .from("products")
    // Numbers go as exact decimal strings (PostgREST accepts them for numeric); the generated
    // types say number, hence the cast.
    .update(changes as never)
    .eq("id", t.data.productId)
    .eq("updated_at", t.data.version)
    .select("id");
  if (saved.error) {
    return fail(
      saved.error.code === "23514"
        ? "The catalog refused a value. Check the highlighted rules and try again."
        : "Couldn't save because of a problem on our side. Try again.",
    );
  }
  if (!saved.data?.length) {
    return fail(
      "Someone else changed this product after you opened it. Reload to see their changes, then edit again.",
    );
  }

  const after = await supabase
    .from("classifications")
    .select("status")
    .eq("product_id", t.data.productId)
    .eq("is_current", true)
    .eq("market", "US")
    .maybeSingle();
  const outdated =
    CONFIRMED.has(before.data?.status ?? "") &&
    after.data?.status === "outdated";

  revalidatePath("/app/catalog");
  redirect(
    `/app/catalog/${t.data.productId}?saved=${outdated ? "outdated" : "1"}`,
  );
}
