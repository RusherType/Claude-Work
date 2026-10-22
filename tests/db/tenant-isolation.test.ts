/**
 * CD-005 — tenant isolation (docs/03-security.md, "Data isolation").
 *
 * Signs in as two users with their own workspaces and proves, for every table that
 * carries `workspace_id`, that user A can neither read nor change workspace B's rows.
 * The table list comes from the database itself, so a new tenant table without a
 * case here fails the suite instead of going untested.
 *
 * Needs the local Supabase stack: `supabase start`, then `pnpm test:db`.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sql = postgres(
  process.env.SUPABASE_DB_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  {
    max: 2,
    onnotice: () => {},
  },
);

type Client = SupabaseClient<Database>;
type Tenant = { client: Client; userId: string; workspaceId: string };

/** A harmless column per table to attempt an update on. */
const UPDATE_COLUMN: Record<string, [string, unknown]> = {
  agent_questions: ["answer", "hacked"],
  agent_runs: ["error", "hacked"],
  alert_items: ["cost_after", 999],
  alerts: ["title", "hacked"],
  api_keys: ["name", "hacked"],
  audit_log: ["action", "hacked"],
  broker_orders: ["broker_notes", "hacked"],
  classifications: ["reasoning", "hacked"],
  documents: ["storage_path", "hacked"],
  integrations: ["status", "hacked"],
  invitations: ["email", "hacked@example.com"],
  memberships: ["role", "viewer"],
  products: ["title", "hacked"],
  quote_lines: ["quantity", 999],
  quotes: ["name", "hacked"],
  subscriptions: ["plan", "pro"],
};

async function signUp(
  label: string,
): Promise<{ client: Client; userId: string }> {
  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });
  const email = `${label}-${randomUUID()}@clearduty.test`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { client, userId: data.user.id };
}

async function tenant(label: string): Promise<Tenant> {
  const { client, userId } = await signUp(label);
  const { data, error } = await client.rpc("create_workspace", {
    p_name: `${label} Co`,
    p_home_country: "IN",
  });
  if (error || !data) throw error ?? new Error("no workspace");
  return { client, userId, workspaceId: data };
}

/** One row in every tenant table for this workspace, written as the service role. */
async function seed(ws: string, userId: string) {
  await sql.begin(async (tx) => {
    const [integration] =
      await tx`insert into integrations (workspace_id, provider) values (${ws}, 'csv') returning id`;
    const [product] =
      await tx`insert into products (workspace_id, integration_id, title, sku)
      values (${ws}, ${integration.id}, 'Cotton t-shirt', 'SKU-1') returning id`;
    const [run] =
      await tx`insert into agent_runs (workspace_id, product_id, model, prompt_version)
      values (${ws}, ${product.id}, 'test-model', 'v0') returning id`;
    await tx`insert into classifications (workspace_id, product_id, code, agent_run_id)
      values (${ws}, ${product.id}, '6109100012', ${run.id})`;
    await tx`insert into agent_questions (workspace_id, product_id, question) values (${ws}, ${product.id}, 'Knit or woven?')`;
    const [quote] =
      await tx`insert into quotes (workspace_id, name) values (${ws}, 'Q1') returning id`;
    await tx`insert into quote_lines (quote_id, workspace_id, product_id, quantity) values (${quote.id}, ${ws}, ${product.id}, 1)`;
    const [alert] =
      await tx`insert into alerts (workspace_id, kind, title) values (${ws}, 'revision', 'New revision') returning id`;
    await tx`insert into alert_items (alert_id, workspace_id, product_id) values (${alert.id}, ${ws}, ${product.id})`;
    await tx`insert into documents (workspace_id, kind, storage_path) values (${ws}, 'classification_sheet', 'x.pdf')`;
    await tx`insert into broker_orders (workspace_id, product_id) values (${ws}, ${product.id})`;
    await tx`insert into subscriptions (workspace_id) values (${ws})`;
    await tx`insert into api_keys (workspace_id, key_hash, prefix) values (${ws}, ${randomUUID()}, 'cd_')`;
    await tx`insert into invitations (workspace_id, email, token_hash, invited_by)
      values (${ws}, ${`invitee-${randomUUID()}@clearduty.test`}, ${randomUUID()}, ${userId})`;
  });
}

async function rowsOf(table: string, ws: string) {
  return sql`select * from ${sql(table)} where workspace_id = ${ws} order by 1`;
}

let a: Tenant;
let b: Tenant;
let tenantTables: string[];

beforeAll(async () => {
  [a, b] = await Promise.all([tenant("alice"), tenant("bob")]);
  await Promise.all([
    seed(a.workspaceId, a.userId),
    seed(b.workspaceId, b.userId),
  ]);
  const tables = await sql`
    select c.table_name from information_schema.columns c
    join information_schema.tables t using (table_schema, table_name)
    where c.table_schema = 'public' and c.column_name = 'workspace_id' and t.table_type = 'BASE TABLE'
    order by 1`;
  tenantTables = tables.map((t) => t.table_name as string);
}, 60_000);

afterAll(async () => {
  await sql.end();
});

describe("coverage", () => {
  it("every tenant table has a case in this suite", () => {
    expect(tenantTables.length).toBeGreaterThan(10);
    expect(tenantTables.filter((t) => !(t in UPDATE_COLUMN))).toEqual([]);
  });

  it("row level security is on for every public table", async () => {
    const off = await sql`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;
    expect(off.map((r) => r.relname)).toEqual([]);
  });

  it("both workspaces have a row in every tenant table", async () => {
    for (const table of tenantTables) {
      expect(
        (await rowsOf(table, a.workspaceId)).length,
        `${table} for A`,
      ).toBeGreaterThan(0);
      expect(
        (await rowsOf(table, b.workspaceId)).length,
        `${table} for B`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("workspace A cannot reach workspace B", () => {
  it("cannot see B's workspace", async () => {
    const { data } = await a.client.from("workspaces").select("id");
    expect(data?.map((w) => w.id)).toEqual([a.workspaceId]);
  });

  it("cannot rename or delete B's workspace", async () => {
    await a.client
      .from("workspaces")
      .update({ name: "hacked" })
      .eq("id", b.workspaceId);
    await a.client.from("workspaces").delete().eq("id", b.workspaceId);
    const [ws] =
      await sql`select name from workspaces where id = ${b.workspaceId}`;
    expect(ws.name).toBe("bob Co");
  });

  it.each(Object.keys(UPDATE_COLUMN))(
    "%s: no read, update, delete, insert or move",
    async (table) => {
      const client = a.client as unknown as SupabaseClient;
      const before = await rowsOf(table, b.workspaceId);

      // Read: every visible row belongs to A, and none of B's rows are visible
      const { data: visible, error: readError } = await client
        .from(table)
        .select("workspace_id");
      expect(readError).toBeNull();
      expect(
        (visible ?? []).every((r) => r.workspace_id === a.workspaceId),
      ).toBe(true);
      const { data: leaked } = await client
        .from(table)
        .select("*")
        .eq("workspace_id", b.workspaceId);
      expect(leaked ?? []).toEqual([]);

      // Update and delete aimed at B: silently filtered by RLS
      const [column, value] = UPDATE_COLUMN[table];
      await client
        .from(table)
        .update({ [column]: value })
        .eq("workspace_id", b.workspaceId);
      await client.from(table).delete().eq("workspace_id", b.workspaceId);
      expect(await rowsOf(table, b.workspaceId)).toEqual(before);

      // Insert into B: rejected
      const { error: insertError } = await client
        .from(table)
        .insert({ workspace_id: b.workspaceId });
      expect(insertError).not.toBeNull();
      expect(await rowsOf(table, b.workspaceId)).toEqual(before);

      // Move A's own rows into B: rejected or filtered, never applied
      const ownBefore = await rowsOf(table, a.workspaceId);
      await client
        .from(table)
        .update({ workspace_id: b.workspaceId })
        .eq("workspace_id", a.workspaceId);
      expect(await rowsOf(table, b.workspaceId)).toEqual(before);
      if (table !== "memberships")
        expect(await rowsOf(table, a.workspaceId)).toEqual(ownBefore);
    },
  );

  it("cannot list B's members or accept B's invites without the token", async () => {
    const { data } = await a.client.rpc("workspace_members", {
      ws: b.workspaceId,
    });
    expect(data ?? []).toEqual([]);
    const { error } = await a.client.rpc("accept_invitation", {
      p_token: "guess",
    });
    expect(error).not.toBeNull();
  });
});

describe("roles inside a workspace", () => {
  let viewer: { client: Client; userId: string };
  let admin: { client: Client; userId: string };

  beforeAll(async () => {
    [viewer, admin] = await Promise.all([signUp("viewer"), signUp("admin")]);
    await sql`insert into memberships (workspace_id, user_id, role) values
      (${a.workspaceId}, ${viewer.userId}, 'viewer'), (${a.workspaceId}, ${admin.userId}, 'admin')`;
  });

  it("a viewer can read but not write catalog data", async () => {
    const { data } = await viewer.client.from("products").select("id");
    expect(data?.length).toBeGreaterThan(0);
    const { error } = await viewer.client
      .from("products")
      .insert({ workspace_id: a.workspaceId, title: "x" });
    expect(error).not.toBeNull();
  });

  it("an admin cannot promote themselves or demote the owner", async () => {
    await admin.client
      .from("memberships")
      .update({ role: "owner" })
      .eq("user_id", admin.userId);
    await admin.client
      .from("memberships")
      .update({ role: "viewer" })
      .eq("user_id", a.userId);
    const roles =
      await sql`select user_id, role from memberships where workspace_id = ${a.workspaceId}`;
    const byUser = Object.fromEntries(roles.map((r) => [r.user_id, r.role]));
    expect(byUser[admin.userId]).toBe("admin");
    expect(byUser[a.userId]).toBe("owner");
  });

  it("the last owner cannot be demoted or removed", async () => {
    const demote = await a.client
      .from("memberships")
      .update({ role: "admin" })
      .eq("workspace_id", a.workspaceId)
      .eq("user_id", a.userId);
    expect(demote.error?.message).toMatch(/at least one owner/);
  });

  it("audit rows cannot be forged, changed or deleted", async () => {
    const forged = await viewer.client.from("audit_log").insert({
      workspace_id: a.workspaceId,
      actor_id: a.userId,
      action: "forged",
    });
    expect(forged.error).not.toBeNull();
    const before = await rowsOf("audit_log", a.workspaceId);
    await a.client
      .from("audit_log")
      .update({ action: "changed" })
      .eq("workspace_id", a.workspaceId);
    await a.client.from("audit_log").delete().eq("workspace_id", a.workspaceId);
    expect(await rowsOf("audit_log", a.workspaceId)).toEqual(before);
  });

  it("users cannot make themselves platform admin", async () => {
    await viewer.client
      .from("profiles")
      .update({ is_platform_admin: true })
      .eq("id", viewer.userId);
    const [profile] =
      await sql`select is_platform_admin from profiles where id = ${viewer.userId}`;
    expect(profile.is_platform_admin).toBe(false);
  });
});
