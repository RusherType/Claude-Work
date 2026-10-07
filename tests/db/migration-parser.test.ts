import { describe, expect, it } from "vitest";
import {
  expandLoops,
  hasTopLevelOr,
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
    expect(s.policies[0].using).toMatch(/^has_role\(workspace_id/);
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

describe("expandLoops keeps the rest of the block", () => {
  it("sees statements after a loop and in a second loop", () => {
    const s = parseMigrations([
      `alter table a enable row level security;
       alter table b enable row level security;
       do $$
       declare t text;
       begin
         foreach t in array array['c'] loop
           execute format('alter table %I enable row level security', t);
         end loop;
         alter table a disable row level security;
         foreach t in array array['b'] loop
           execute format('alter table %I disable row level security', t);
         end loop;
       end $$;`,
    ]);
    expect([...s.rlsEnabled]).toEqual(["c"]);
  });
});

describe("policy expressions", () => {
  it("extracts using and with check separately", () => {
    const [p] = parseMigrations([
      `create policy p on t for all using (has_role(workspace_id, array['owner']::member_role[])) with check (true);`,
    ]).policies;
    expect(p.using).toBe(
      "has_role(workspace_id, array['owner']::member_role[])",
    );
    expect(p.check).toBe("true");
  });

  it("reads FOR only right after the table, so text inside using is ignored", () => {
    const [p] = parseMigrations([
      `create policy p on t using (exists (select 1 from x where kind = 'for select'));`,
    ]).policies;
    expect(p.command).toBe("all");
  });

  it("finds top-level OR but not OR inside parens, strings or words", () => {
    expect(hasTopLevelOr("is_member(workspace_id) or true")).toBe(true);
    expect(hasTopLevelOr("is_member(workspace_id) OR\ntrue")).toBe(true);
    expect(hasTopLevelOr("is_member(workspace_id) and (a or b)")).toBe(false);
    expect(
      hasTopLevelOr(
        "has_role(workspace_id, array['owner','or']::member_role[])",
      ),
    ).toBe(false);
    expect(hasTopLevelOr("is_member(workspace_id) and color = 1")).toBe(false);
  });
});

describe("needsReview", () => {
  it("flags renames and workspace_id changes", () => {
    const s = parseMigrations([
      `alter table products rename to items;
       alter table quotes alter column workspace_id drop not null;
       alter table quotes add column note text;`,
    ]);
    expect(s.needsReview).toEqual([
      "alter table products rename to items;",
      "alter table quotes alter column workspace_id drop not null;",
    ]);
  });
});
