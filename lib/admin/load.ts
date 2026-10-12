import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ENTITIES, TABLES, type Entity } from "./schemas";

export type RefRow = Record<string, unknown> & {
  id: string;
  published: boolean;
  effective_from: string;
  effective_to: string | null;
};

export function parseEntity(value: string): Entity | null {
  return (ENTITIES as readonly string[]).includes(value)
    ? (value as Entity)
    : null;
}

/** All rows of a reference table, newest start date first (RLS: admins with aal2 see drafts). */
export async function listRows(entity: Entity): Promise<RefRow[]> {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase
    .from(TABLES[entity])
    .select("*")
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
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase
    .from(TABLES[entity])
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Could not load the row");
  return data as unknown as RefRow | null;
}

export const today = () => new Date().toISOString().slice(0, 10);
