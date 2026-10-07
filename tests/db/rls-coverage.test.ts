import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMigrations } from "./migration-parser";

// Static guard on supabase/migrations: every table gets RLS, tenant tables are scoped by workspace,
// and audit_log stays append-only. The live two-workspace isolation suite is CD-005.

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(dir, f), "utf8"));
const schema = parseMigrations(files);

// Shared reference data (docs/06-schema.md): readable by signed-in users, no workspace_id.
const SHARED = new Set([
  "profiles",
  "tariff_revisions",
  "tariff_lines",
  "rulings",
  "ruling_chunks",
  "tariff_measures",
  "fee_schedules",
]);
const tenantTables = [...schema.tables.keys()].filter(
  (t) => !SHARED.has(t) && t !== "workspaces",
);

describe("migrations", () => {
  it("parses every create table statement", () => {
    expect(schema.tables.size).toBe(schema.createTableStatements);
    expect(schema.tables.has("products")).toBe(true);
    expect(schema.tables.has("audit_log")).toBe(true);
  });

  it("enables RLS on every table", () => {
    const missing = [...schema.tables.keys()].filter(
      (t) => !schema.rlsEnabled.has(t),
    );
    expect(missing).toEqual([]);
  });

  it("gives every tenant table a required workspace_id", () => {
    const bad = tenantTables.filter((t) => {
      const body = schema.tables.get(t)!;
      const notNull =
        /\bworkspace_id\s+uuid\b[^,]*\b(not\s+null|primary\s+key)\b/i.test(
          body,
        );
      const inPk = /primary\s+key\s*\([^)]*\bworkspace_id\b/i.test(body);
      return !(notNull || inPk);
    });
    expect(bad).toEqual([]);
  });

  it("scopes every tenant policy by workspace", () => {
    const scoped = /\b(is_member|has_role)\s*\(\s*workspace_id\b/i;
    const unscoped = schema.policies
      .filter((p) => tenantTables.includes(p.table))
      .filter((p) => !scoped.test(p.body))
      .map((p) => `${p.table}.${p.name}`);
    expect(unscoped).toEqual([]);

    const wsScoped = /\b(is_member|has_role)\s*\(\s*id\b/i;
    const ws = schema.policies.filter(
      (p) => p.table === "workspaces" && !wsScoped.test(p.body),
    );
    expect(ws.map((p) => p.name)).toEqual([]);
  });

  it("only allows select and insert on audit_log", () => {
    const commands = schema.policies
      .filter((p) => p.table === "audit_log")
      .map((p) => p.command);
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.filter((c) => c !== "select" && c !== "insert")).toEqual(
      [],
    );
  });
});
