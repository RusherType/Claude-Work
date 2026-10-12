"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminAccess } from "@/lib/admin/access";
import {
  ENTITIES,
  fieldErrors,
  formToInput,
  SCHEMAS,
  TABLES,
  type Entity,
} from "@/lib/admin/schemas";
import { createClient } from "@/lib/supabase/server";

// CD-014: drafts, publishing, end dates. Every action validates its input with Zod and checks
// admin + second factor here for a clear message; the database (RLS with is_platform_admin_mfa,
// guard_reference_row, checks) is the real enforcement.

export type EditState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      errors?: Record<string, string>;
      /** What was submitted, so the form can show it again (React resets forms after actions). */
      values?: Record<string, unknown>;
      /** Changes on every failed attempt, to remount the form with `values`. */
      attempt?: number;
    };

/** The submitted form as a row-shaped object the form fields can display. */
function submitted(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const v = form.get(key);
    if (typeof v === "string") out[key] = v;
  }
  out.applies_to_modes = form.getAll("applies_to_modes");
  out.mpf_exempt = form.get("mpf_exempt") === "on";
  out.exempt_programs =
    form.get("exempt_known") === "on"
      ? (form.get("exempt_programs") ?? "")
      : null;
  return out;
}

const target = z.object({ entity: z.enum(ENTITIES), id: z.uuid().nullable() });

function dbMessage(error: { code?: string; message?: string }): string {
  if (error.code === "42501") {
    return /published_rows_are_permanent/.test(error.message ?? "")
      ? "Published rows can't be changed. Give it an end date and add a new row instead."
      : "You need to be a platform admin with a second factor to change this.";
  }
  if (error.code === "23514") {
    return "The database refused a value. Check prefixes, countries, dates and the https source.";
  }
  return "Couldn't save. Try again.";
}

async function client() {
  const access = await adminAccess();
  if (access.status !== "ok") return null;
  return createClient();
}

export async function saveDraft(
  entity: Entity,
  id: string | null,
  _prev: EditState,
  form: FormData,
): Promise<EditState> {
  // Every failure keeps what was typed (React resets the form after an action).
  const fail = (
    message: string,
    errors?: Record<string, string>,
  ): EditState => ({
    status: "error",
    message,
    errors,
    values: submitted(form),
    attempt: Date.now(),
  });
  const t = target.safeParse({ entity, id });
  if (!t.success) return fail("Unknown row.");
  const parsed = SCHEMAS[t.data.entity].safeParse(
    formToInput(t.data.entity, form),
  );
  if (!parsed.success) {
    return fail("Fix the highlighted fields.", fieldErrors(parsed.error));
  }
  const supabase = await client();
  if (!supabase) return fail(dbMessage({ code: "42501" }));

  const table = TABLES[t.data.entity];
  const values = parsed.data as Record<string, unknown>;
  const result = t.data.id
    ? await supabase
        .from(table)
        .update(values as never)
        .eq("id", t.data.id)
        .eq("published", false)
        .select("id")
    : await supabase
        .from(table)
        .insert(values as never)
        .select("id");
  if (result.error) return fail(dbMessage(result.error));
  const saved = result.data?.[0]?.id;
  if (!saved)
    return fail("This row was published or removed meanwhile. Reload.");
  revalidatePath("/app/admin", "layout");
  redirect(`/app/admin/${t.data.entity}/${saved}`);
}

const rowForm = z.object({
  entity: z.enum(ENTITIES),
  id: z.uuid(),
});

async function rowAction(
  form: FormData,
  run: (
    supabase: NonNullable<Awaited<ReturnType<typeof client>>>,
    table: (typeof TABLES)[Entity],
    id: string,
  ) => PromiseLike<{ error: { code?: string; message?: string } | null }>,
  after: (entity: Entity, id: string) => string,
): Promise<EditState> {
  const parsed = rowForm.safeParse({
    entity: form.get("entity"),
    id: form.get("id"),
  });
  if (!parsed.success) return { status: "error", message: "Unknown row." };
  const supabase = await client();
  if (!supabase)
    return { status: "error", message: dbMessage({ code: "42501" }) };
  const { error } = await run(
    supabase,
    TABLES[parsed.data.entity],
    parsed.data.id,
  );
  if (error) return { status: "error", message: dbMessage(error) };
  revalidatePath("/app/admin", "layout");
  redirect(after(parsed.data.entity, parsed.data.id));
}

export async function publishRow(
  _prev: EditState,
  form: FormData,
): Promise<EditState> {
  return rowAction(
    form,
    (s, table, id) =>
      s
        .from(table)
        .update({ published: true } as never)
        .eq("id", id)
        .eq("published", false),
    (entity, id) => `/app/admin/${entity}/${id}`,
  );
}

export async function deleteDraft(
  _prev: EditState,
  form: FormData,
): Promise<EditState> {
  return rowAction(
    form,
    (s, table, id) =>
      s.from(table).delete().eq("id", id).eq("published", false),
    (entity) => `/app/admin/${entity}`,
  );
}

const endDate = z.iso.date({ error: "Use a date like 2026-12-31." });

export async function endRow(
  _prev: EditState,
  form: FormData,
): Promise<EditState> {
  const date = endDate.safeParse(form.get("effective_to"));
  if (!date.success)
    return { status: "error", message: date.error.issues[0].message };
  return rowAction(
    form,
    (s, table, id) =>
      s
        .from(table)
        .update({ effective_to: date.data } as never)
        .eq("id", id)
        .eq("published", true),
    (entity, id) => `/app/admin/${entity}/${id}`,
  );
}
