import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isScoped,
  parseMigrations,
  stripOuterParens,
  type Policy,
} from "./migration-parser";

// Static guard on supabase/migrations (docs/03-security.md, docs/06-schema.md): every table has RLS,
// tenant rows are scoped to a workspace, shared reference data is read-only to users, profiles are
// per-user, and audit_log is append-only. The live two-workspace isolation suite is CD-005.

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(dir, f), "utf8"));
const schema = parseMigrations(files);

const SHARED = new Set([
  "tariff_revisions",
  "tariff_lines",
  "rulings",
  "ruling_chunks",
  "tariff_measures",
  "fee_schedules",
]);
const PER_USER = new Set(["profiles"]);
const tenantTables = [...schema.tables.keys()].filter(
  (t) => !SHARED.has(t) && !PER_USER.has(t) && t !== "workspaces",
);
const policiesOn = (tables: Iterable<string>) => {
  const set = new Set(tables);
  return schema.policies.filter((p) => set.has(p.table));
};
const expressions = (p: Policy) =>
  [p.using, p.check].filter((e): e is string => e !== null);
const label = (p: Policy) => `${p.table}.${p.name}`;

// Exact forms that scope a row to the caller (see isScoped).
const TENANT_SCOPE = [
  /^is_member\(workspace_id\)$/i,
  /^has_role\(workspace_id,\s*array\[[^\]]*\]::member_role\[\]\)$/i,
];
const WORKSPACE_SCOPE = [
  /^is_member\(id\)$/i,
  /^has_role\(id,\s*array\[[^\]]*\]::member_role\[\]\)$/i,
];
const PROFILE_SCOPE = [/^(id\s*=\s*auth\.uid\(\)|auth\.uid\(\)\s*=\s*id)$/i];

function unscoped(policies: Policy[], allowed: RegExp[]): string[] {
  return policies
    .filter((p) => {
      const exprs = expressions(p);
      return exprs.length === 0 || exprs.some((e) => !isScoped(e, allowed));
    })
    .map(label);
}

describe("migrations", () => {
  it("parses every create table statement", () => {
    expect(schema.tables.size).toBe(schema.createTableStatements);
    expect(schema.tables.has("products")).toBe(true);
    expect(schema.tables.has("audit_log")).toBe(true);
  });

  it("has no table renames or workspace_id alterations the guard cannot check", () => {
    expect(schema.needsReview).toEqual([]);
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

  it("scopes every tenant policy expression to the row's workspace", () => {
    expect(unscoped(policiesOn(tenantTables), TENANT_SCOPE)).toEqual([]);
    expect(unscoped(policiesOn(["workspaces"]), WORKSPACE_SCOPE)).toEqual([]);
  });

  it("keeps shared reference data read-only to users", () => {
    const writable = policiesOn(SHARED)
      .filter((p) => p.command !== "select")
      .filter(
        (p) =>
          p.table !== "tariff_measures" ||
          expressions(p).length === 0 ||
          expressions(p).some(
            (e) => !/^is_platform_admin\(\)$/i.test(stripOuterParens(e)),
          ),
      )
      .map(label);
    expect(writable).toEqual([]);
  });

  it("limits profiles to their own user", () => {
    expect(unscoped(policiesOn(PER_USER), PROFILE_SCOPE)).toEqual([]);
  });

  it("only allows select and insert on audit_log", () => {
    const commands = policiesOn(["audit_log"]).map((p) => p.command);
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.filter((c) => c !== "select" && c !== "insert")).toEqual(
      [],
    );
  });
});
