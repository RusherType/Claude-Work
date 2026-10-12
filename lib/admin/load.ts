import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminAccess } from "./access";
import { ENTITIES, TABLES, type Entity } from "./schemas";

export type RefRow = Record<string, unknown> & {
  id: string;
  published: boolean;
  effective_from: string;
  effective_to: string | null;
};

// Explicit columns: the author columns (created_by, published_by) are not granted to users;
// who changed what is in the change log.
const COLUMNS: Record<Entity, string> = {
  measures:
    "id, authority, ch99_code, hts_prefixes, excluded_prefixes, origin_countries, rate_type, rate_value, applies_to_modes, exempt_programs, effective_from, effective_to, source_url, notes, published, published_at",
  fees: "id, fee_type, mode, carrier, pct, flat_amount, min_amount, max_amount, effective_from, effective_to, source_url, notes, published, published_at",
  programs:
    "id, symbol, name, countries, mpf_exempt, effective_from, effective_to, source_url, notes, published, published_at",
};

export function parseEntity(value: string): Entity | null {
  return (ENTITIES as readonly string[]).includes(value)
    ? (value as Entity)
    : null;
}

/** A Supabase client for admin pages; anyone else gets a 404 (the layout also gates, but every
 * loader checks for itself). */
export async function adminClient() {
  if ((await adminAccess()).status !== "ok") notFound();
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

/** All rows of a reference table, newest start date first (RLS: admins with aal2 see drafts). */
export async function listRows(entity: Entity): Promise<RefRow[]> {
  const supabase = await adminClient();
  const { data, error } = await supabase
    .from(TABLES[entity])
    .select(COLUMNS[entity])
    .order("effective_from", { ascending: false })
    .limit(500);
  if (error) throw new Error("Could not load rows");
  return data as unknown as RefRow[];
}

export async function getRow(
  entity: Entity,
  id: string,
): Promise<RefRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await adminClient();
  const { data, error } = await supabase
    .from(TABLES[entity])
    .select(COLUMNS[entity])
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Could not load the row");
  return data as unknown as RefRow | null;
}

export const today = () => new Date().toISOString().slice(0, 10);
