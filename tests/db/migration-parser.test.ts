import { describe, expect, it } from "vitest";
import {
  expandLoops,
  normalizeIdent,
  parseMigrations,
} from "./migration-parser";

describe("normalizeIdent", () => {
  it("drops schema and quotes, lowercases unquoted names", () => {
    expect(normalizeIdent("public.Products")).toBe("products");
    expect(normalizeIdent('"audit_log"')).toBe("audit_log");
    expect(normalizeIdent('public."audit_log"')).toBe("audit_log");
  });
});

describe("parseMigrations tables", () => {
  it("finds schema-qualified, quoted, unlogged and oddly spaced tables", () => {
    const s = parseMigrations([
      `create table public.a (id int);
       create   table "b" (id int);
       create table
         c (id int);
       create unlogged table d (id int);
       create table if not exists e (id int);`,
    ]);
    expect([...s.tables.keys()]).toEqual(["a", "b", "c", "d", "e"]);
    expect(s.createTableStatements).toBe(5);
  });

  it("keeps each body to its own table even with nested parens and indented close", () => {
    const s = parseMigrations([
      `create table leak (id int, v numeric(10,2)
         ) partition by range (id);
       create table next (workspace_id uuid not null);`,
    ]);
    expect(s.tables.get("leak")).not.toMatch(/workspace_id/);
    expect(s.tables.get("next")).toMatch(/workspace_id/);
  });
});

describe("parseMigrations RLS", () => {
  it("handles qualified names, only, if exists, and later disables", () => {
    const s = parseMigrations([
      `alter table public.a enable row level security;
       alter table only b enable row level security;
       alter table if exists c enable row level security;
       alter table d enable row level security;`,
      `alter table d disable row level security;`,
    ]);
    expect([...s.rlsEnabled].sort()).toEqual(["a", "b", "c"]);
  });

  it("ignores enables inside block and line comments", () => {
    const s = parseMigrations([
      `/* alter table x enable row level security; */
       -- alter table y enable row level security;`,
    ]);
    expect(s.rlsEnabled.size).toBe(0);
  });

  it("expands foreach loops into per-table statements", () => {
    const sql = `do $$
      declare t text;
      begin
        foreach t in array array['p','q'] loop
          execute format('alter table %I enable row level security', t);
          execute format($p$create policy %I on %I for all using (has_role(workspace_id, array['owner']::member_role[]))$p$, t || '_w', t);
        end loop;
      end $$;`;
    expect(expandLoops(sql)).toMatch(/alter table q enable row level security/);
    const s = parseMigrations([sql]);
    expect([...s.rlsEnabled].sort()).toEqual(["p", "q"]);
    expect(s.policies.map((p) => `${p.table}:${p.command}`)).toEqual([
      "p:all",
      "q:all",
    ]);
    expect(s.policies[0].body).toMatch(/has_role\(workspace_id/);
  });
});

describe("parseMigrations policies", () => {
  it("treats a policy with no FOR clause as ALL and sees through quoting and AS", () => {
    const s = parseMigrations([
      `create policy p1 on audit_log using (true);
       create policy "p 2" on public.audit_log as restrictive for delete using (true);
       create policy p3 on "audit_log" for select using (true);`,
    ]);
    expect(s.policies.map((p) => [p.name, p.table, p.command])).toEqual([
      ["p1", "audit_log", "all"],
      ["p 2", "audit_log", "delete"],
      ["p3", "audit_log", "select"],
    ]);
  });
});
