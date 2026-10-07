import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Static guard on supabase/migrations: every table gets RLS, and audit_log stays append-only.
// The live two-workspace isolation suite is CD-005.

const dir = join(process.cwd(), "supabase", "migrations");
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(dir, f), "utf8"))
  .join("\n")
  .replace(/--[^\n]*/g, "");

function createdTables(): Map<string, string> {
  const tables = new Map<string, string>();
  const re = /create table (?:if not exists )?(\w+)\s*\(([\s\S]*?)\n\);/gi;
  for (const m of sql.matchAll(re)) tables.set(m[1], m[2]);
  return tables;
}

function rlsEnabledTables(): Set<string> {
  const enabled = new Set<string>();
  for (const m of sql.matchAll(/alter table (\w+) enable row level security/gi))
    enabled.add(m[1]);
  // do-blocks: foreach t in array array['a','b'] loop ... enable row level security ... end loop
  const loopRe =
    /foreach \w+ in array array\[([\s\S]*?)\] loop([\s\S]*?)end loop/gi;
  for (const m of sql.matchAll(loopRe)) {
    if (!/enable row level security/i.test(m[2])) continue;
    for (const name of m[1].matchAll(/'(\w+)'/g)) enabled.add(name[1]);
  }
  return enabled;
}

describe("migrations", () => {
  const tables = createdTables();
  const enabled = rlsEnabledTables();

  it("parses the expected tables", () => {
    expect(tables.size).toBeGreaterThanOrEqual(23);
    expect(tables.has("products")).toBe(true);
    expect(tables.has("audit_log")).toBe(true);
  });

  it("enables RLS on every table", () => {
    const missing = [...tables.keys()].filter((t) => !enabled.has(t));
    expect(missing).toEqual([]);
  });

  it("gives every tenant table a workspace_id", () => {
    const shared = new Set([
      "profiles",
      "tariff_revisions",
      "tariff_lines",
      "rulings",
      "ruling_chunks",
      "tariff_measures",
      "fee_schedules",
    ]);
    const tenantWithoutWs = [...tables]
      .filter(([name]) => !shared.has(name) && name !== "workspaces")
      .filter(([, body]) => !/\bworkspace_id\b/.test(body))
      .map(([name]) => name);
    expect(tenantWithoutWs).toEqual([]);
  });

  it("never allows update or delete on audit_log", () => {
    const writes = [
      ...sql.matchAll(/create policy \w+ on audit_log for (\w+)/gi),
    ].map((m) => m[1].toLowerCase());
    expect(writes.length).toBeGreaterThan(0);
    expect(
      writes.filter((w) => w === "update" || w === "delete" || w === "all"),
    ).toEqual([]);
  });
});
