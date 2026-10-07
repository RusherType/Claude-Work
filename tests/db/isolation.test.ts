import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// CD-005: live tenant-isolation suite. Signs in (with the JWT claim Supabase uses) as members of two
// workspaces and proves neither can read, change, move or link to the other's rows, and that each
// role can only write what docs/03-security.md allows.
//
// Runs only against a LOCAL database with our migrations applied, via TEST_DATABASE_URL:
//   CI: the local Supabase from `supabase start` (REQUIRE_DB_TESTS=1 makes a missing URL fail).
//   Locally: see docs/06-schema.md ("Tests").

const url = process.env.TEST_DATABASE_URL;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
if (url && !LOCAL_HOSTS.has(new URL(url).hostname)) {
  throw new Error(
    "TEST_DATABASE_URL must point at a local database; this suite writes test data.",
  );
}

type W = "A" | "B";
type Ids = Record<string, string>;
const ws: Record<W, string> = { A: randomUUID(), B: randomUUID() };
const user = {
  ownerA: randomUUID(),
  adminA: randomUUID(),
  memberA: randomUUID(),
  viewerA: randomUUID(),
  ownerB: randomUUID(),
  outsider: randomUUID(),
};
const CHILD_KEYS = [
  "classification",
  "question",
  "quoteLine",
  "document",
  "brokerOrder",
  "apiKey",
  "integration",
  "product",
  "run",
  "quote",
  "alert",
  "product2",
];
const newIds = (): Ids =>
  Object.fromEntries(CHILD_KEYS.map((k) => [k, randomUUID()]));
const id: Record<W, Ids> = { A: newIds(), B: newIds() };

// One insert per tenant table. `ids` holds the row's own id and its parents' ids.
type Insert = (w: string, ids: Ids, actor: string) => [string, unknown[]];
const INSERT: Record<string, Insert> = {
  memberships: (w) => [
    `insert into memberships (workspace_id, user_id, role) values ($1, $2, 'member')`,
    [w, user.outsider],
  ],
  integrations: (w, ids) => [
    `insert into integrations (id, workspace_id, provider, shop_domain) values ($1, $2, 'csv', $3)`,
    [ids.integration, w, `shop-${ids.integration}`],
  ],
  products: (w, ids) => [
    `insert into products (id, workspace_id, integration_id, title) values ($1, $2, $3, 'Tee')`,
    [ids.product, w, ids.integration],
  ],
  agent_runs: (w, ids) => [
    `insert into agent_runs (id, workspace_id, product_id, model, prompt_version) values ($1, $2, $3, 'm', 'v1')`,
    [ids.run, w, ids.product],
  ],
  classifications: (w, ids) => [
    `insert into classifications (id, workspace_id, product_id, agent_run_id, is_current) values ($1, $2, $3, $4, false)`,
    [ids.classification, w, ids.product, ids.run],
  ],
  agent_questions: (w, ids) => [
    `insert into agent_questions (id, workspace_id, product_id, agent_run_id, question) values ($1, $2, $3, $4, 'Material?')`,
    [ids.question, w, ids.product, ids.run],
  ],
  quotes: (w, ids) => [
    `insert into quotes (id, workspace_id) values ($1, $2)`,
    [ids.quote, w],
  ],
  quote_lines: (w, ids) => [
    `insert into quote_lines (id, quote_id, workspace_id, product_id, quantity) values ($1, $2, $3, $4, 1)`,
    [ids.quoteLine, ids.quote, w, ids.product],
  ],
  alerts: (w, ids) => [
    `insert into alerts (id, workspace_id, kind, title) values ($1, $2, 'revision', 'New revision')`,
    [ids.alert, w],
  ],
  alert_items: (w, ids) => [
    `insert into alert_items (alert_id, workspace_id, product_id) values ($1, $2, $3)`,
    [ids.alert, w, ids.product],
  ],
  documents: (w, ids) => [
    `insert into documents (id, workspace_id, kind, storage_path) values ($1, $2, 'classification_sheet', 'x.pdf')`,
    [ids.document, w],
  ],
  broker_orders: (w, ids) => [
    `insert into broker_orders (id, workspace_id, product_id) values ($1, $2, $3)`,
    [ids.brokerOrder, w, ids.product],
  ],
  subscriptions: (w) => [
    `insert into subscriptions (workspace_id) values ($1)`,
    [w],
  ],
  api_keys: (w, ids) => [
    `insert into api_keys (id, workspace_id, key_hash, prefix) values ($1, $2, $3, 'cd_')`,
    [ids.apiKey, w, `hash-${ids.apiKey}`],
  ],
  audit_log: (w, _ids, actor) => [
    `insert into audit_log (workspace_id, actor_id, action) values ($1, $2, 'test')`,
    [w, actor],
  ],
};
const TENANT_TABLES = Object.keys(INSERT);

// The id keys that identify the inserted row itself (everything else in Ids is a parent).
const OWN_ID: Record<string, string[]> = {
  memberships: [],
  integrations: ["integration"],
  products: ["product"],
  agent_runs: ["run"],
  classifications: ["classification"],
  agent_questions: ["question"],
  quotes: ["quote"],
  quote_lines: ["quoteLine"],
  alerts: ["alert"],
  alert_items: [],
  documents: ["document"],
  broker_orders: ["brokerOrder"],
  subscriptions: [],
  api_keys: ["apiKey"],
  audit_log: [],
};

// A change to data in every row, used to prove a write could not reach the other workspace.
const UPDATE_SET: Record<string, string> = {
  memberships: "role = 'viewer'",
  integrations: "status = 'x'",
  products: "title = 'x'",
  agent_runs: "model = 'x'",
  classifications: "reasoning = 'x'",
  agent_questions: "answer = 'x'",
  quotes: "name = 'x'",
  quote_lines: "quantity = 99",
  alerts: "title = 'x'",
  alert_items: "cost_after = 99",
  documents: "storage_path = 'x'",
  broker_orders: "broker_notes = 'x'",
  subscriptions: "status = 'x'",
  api_keys: "name = 'x'",
  audit_log: "action = 'x'",
};

// Who may insert into which table (docs/03-security.md). Everything else must be rejected.
const ROLE_USERS = {
  owner: user.ownerA,
  admin: user.adminA,
  member: user.memberA,
  viewer: user.viewerA,
} as const;
const CATALOG = ["owner", "admin", "member"];
const MAY_INSERT: Record<string, string[]> = {
  products: CATALOG,
  classifications: CATALOG,
  agent_questions: CATALOG,
  quotes: CATALOG,
  quote_lines: CATALOG,
  alerts: CATALOG,
  alert_items: CATALOG,
  documents: CATALOG,
  integrations: ["owner", "admin"],
  broker_orders: ["owner", "admin"],
  api_keys: ["owner", "admin"],
  memberships: ["owner", "admin"],
  audit_log: ["owner", "admin", "member", "viewer"],
  agent_runs: [], // written by jobs with the service role
  subscriptions: [], // written by Stripe webhooks with the service role
};

const SHARED_SEED: Record<string, string> = {
  tariff_revisions: `insert into tariff_revisions (id, market, label, effective_from) values ('00000000-0000-4000-8000-000000000001', 'US', 'iso-test', '2026-01-01')`,
  tariff_lines: `insert into tariff_lines (revision_id, code, indent, description, is_leaf) values ('00000000-0000-4000-8000-000000000001', '6109100012', 2, 'iso-test', true)`,
  rulings: `insert into rulings (number) values ('ISO-TEST')`,
  ruling_chunks: `insert into ruling_chunks (ruling_number, chunk) values ('ISO-TEST', 'iso-test')`,
  tariff_measures: `insert into tariff_measures (market, authority, hts_prefixes, origin_countries, rate_value, effective_from, source_url, published, notes) values ('US', 'iso-test', '{61}', '{CN}', 25, '2026-01-01', 'https://example.com', true, 'iso-test')`,
  fee_schedules: `insert into fee_schedules (market, fee_type, effective_from, source_url) values ('US', 'iso-test', '2026-01-01', 'iso-test')`,
};
const SHARED_UPDATE: Record<string, string> = {
  tariff_revisions: "label = 'x'",
  tariff_lines: "description = 'x'",
  rulings: "subject = 'x'",
  ruling_chunks: "chunk = 'x'",
  tariff_measures: "rate_value = 0",
  fee_schedules: "fee_type = 'x'",
};

let db: Client;

async function claims(uid: string | null) {
  await db.query(`set local role ${uid ? "authenticated" : "anon"}`);
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify(
      uid ? { sub: uid, role: "authenticated" } : { role: "anon" },
    ),
  ]);
}

// Run `fn` as a signed-in user (or anon) inside a transaction that is always rolled back.
async function as<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await claims(uid);
    return await fn();
  } finally {
    await db.query("rollback");
  }
}

async function errorCode(uid: string, sql: string, params: unknown[] = []) {
  return as(uid, async () => {
    try {
      await db.query(sql, params);
      // Deferred constraint triggers fire at commit; check them inside this transaction too.
      await db.query("set constraints all immediate");
      return null;
    } catch (e) {
      return (e as { code?: string }).code ?? "unknown";
    }
  });
}

// Fingerprint of rows matching `where`, read with full privileges.
async function fingerprint(table: string, where: string, params: unknown[]) {
  const { rows } = await db.query(
    `select count(*)::int as n, md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as h
     from ${table} t where ${where}`,
    params,
  );
  return `${rows[0].n}:${rows[0].h}`;
}

// As `uid`, try each statement with no WHERE clause (so only RLS limits it), then return the
// fingerprint of the protected rows seen with full privileges, in the same transaction.
// Rows that reference `table` are cleared first (inside the rolled-back transaction) so a foreign
// key error on some other row cannot abort the statement and hide what RLS allowed. Each attempt
// must either succeed or be refused by RLS/privileges (42501); any other error fails the test.
async function attemptThenFingerprint(
  uid: string,
  statements: string[],
  table: string,
  where: string,
  params: unknown[],
) {
  await db.query("begin");
  try {
    const { rows: children } = await db.query(
      `select distinct conrelid::regclass::text as child from pg_constraint
       where contype = 'f' and confrelid = $1::regclass and conrelid <> confrelid`,
      [`public.${table}`],
    );
    if (children.length > 0)
      await db.query(
        `truncate ${children.map((c) => c.child).join(", ")} cascade`,
      );
    await claims(uid);
    for (const sql of statements) {
      await db.query("savepoint s");
      try {
        await db.query(sql);
        await db.query("release savepoint s");
      } catch (e) {
        await db.query("rollback to savepoint s");
        const code = (e as { code?: string }).code;
        if (code !== "42501")
          throw new Error(`"${sql}" failed with ${code}, which proves nothing`);
      }
    }
    await db.query("reset role");
    return await fingerprint(table, where, params);
  } finally {
    await db.query("rollback");
  }
}

const suite = url
  ? describe
  : process.env.REQUIRE_DB_TESTS
    ? describe
    : describe.skip;

suite("tenant isolation (live database)", () => {
  beforeAll(async () => {
    if (!url)
      throw new Error(
        "REQUIRE_DB_TESTS is set but TEST_DATABASE_URL is missing",
      );
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    for (const [name, uid] of Object.entries(user))
      await db.query("insert into auth.users (id, email) values ($1, $2)", [
        uid,
        `${name}-${uid}@test.local`,
      ]);
    await db.query(
      "insert into workspaces (id, name, home_country) values ($1, 'A', 'IN'), ($2, 'B', 'GB')",
      [ws.A, ws.B],
    );
    await db.query(
      `insert into memberships (workspace_id, user_id, role) values
        ($1, $2, 'owner'), ($1, $3, 'admin'), ($1, $4, 'member'), ($1, $5, 'viewer'), ($6, $7, 'owner')`,
      [
        ws.A,
        user.ownerA,
        user.adminA,
        user.memberA,
        user.viewerA,
        ws.B,
        user.ownerB,
      ],
    );
    for (const w of ["A", "B"] as const) {
      const actor = w === "A" ? user.ownerA : user.ownerB;
      for (const t of TENANT_TABLES.filter((t) => t !== "memberships")) {
        const [sql, params] = INSERT[t](ws[w], id[w], actor);
        await db.query(sql, params);
      }
    }
    for (const w of ["A", "B"] as const)
      await db.query(
        "insert into products (id, workspace_id, title) values ($1, $2, 'Second product')",
        [id[w].product2, ws[w]],
      );
    for (const sql of Object.values(SHARED_SEED)) await db.query(sql);
    await db.query("commit");
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await db.query("rollback").catch(() => {});
      await db.query("delete from workspaces where id = any($1)", [
        [ws.A, ws.B],
      ]);
      await db.query("delete from auth.users where id = any($1)", [
        Object.values(user),
      ]);
      await db.query(
        "delete from tariff_revisions where label in ('iso-test', 'x')",
      );
      await db.query("delete from rulings where number = 'ISO-TEST'");
      await db.query("delete from tariff_measures where notes = 'iso-test'");
      await db.query("delete from fee_schedules where source_url = 'iso-test'");
    } finally {
      await db.end();
    }
  });

  it("covers every table that has a workspace_id column", async () => {
    const { rows } = await db.query(
      `select table_name from information_schema.columns
       where table_schema = 'public' and column_name = 'workspace_id' order by 1`,
    );
    expect(rows.map((r) => r.table_name).sort()).toEqual(
      [...TENANT_TABLES].sort(),
    );
    expect(Object.keys(UPDATE_SET).sort()).toEqual([...TENANT_TABLES].sort());
    expect(Object.keys(MAY_INSERT).sort()).toEqual([...TENANT_TABLES].sort());
  });

  describe.each(TENANT_TABLES)("%s", (table) => {
    it("is invisible to the other workspace and to anon", async () => {
      const seen = await as(user.ownerA, async () => {
        const { rows } = await db.query(
          `select distinct workspace_id::text from ${table}`,
        );
        return rows.map((r) => r.workspace_id);
      });
      expect(seen).toEqual([ws.A]);
      expect(
        await as(
          user.outsider,
          async () => (await db.query(`select 1 from ${table}`)).rowCount,
        ),
      ).toBe(0);
      expect(
        await as(
          null,
          async () => (await db.query(`select 1 from ${table}`)).rowCount,
        ),
      ).toBe(0);
    });

    it("cannot be changed or deleted in the other workspace", async () => {
      const before = await fingerprint(table, "workspace_id = $1", [ws.B]);
      for (const uid of [user.ownerA, user.outsider]) {
        const after = await attemptThenFingerprint(
          uid,
          [`update ${table} set ${UPDATE_SET[table]}`, `delete from ${table}`],
          table,
          "workspace_id = $1",
          [ws.B],
        );
        expect(after).toBe(before);
      }
    });

    it("cannot be inserted into the other workspace", async () => {
      const [sql, params] = INSERT[table](
        ws.B,
        { ...id.B, ...newIds() },
        user.ownerA,
      );
      expect(await errorCode(user.ownerA, sql, params)).toBe("42501");
    });

    it("cannot be moved into the other workspace", async () => {
      const before = await fingerprint(table, "workspace_id = $1", [ws.B]);
      const after = await attemptThenFingerprint(
        user.ownerA,
        [`update ${table} set workspace_id = '${ws.B}'`],
        table,
        "workspace_id = $1",
        [ws.B],
      );
      expect(after).toBe(before);
    });

    it.each(Object.entries(ROLE_USERS))(
      "insert by %s follows the role table",
      async (role, uid) => {
        // A's existing parents, with a fresh id for the row being inserted (alert_items is keyed
        // by alert + product, so it uses A's second product).
        const ids: Ids = {
          ...id.A,
          ...Object.fromEntries(OWN_ID[table].map((k) => [k, randomUUID()])),
        };
        if (table === "alert_items") ids.product = id.A.product2;
        const [sql, params] = INSERT[table](ws.A, ids, uid);
        const code = await errorCode(uid, sql, params);
        expect(code).toBe(MAY_INSERT[table].includes(role) ? null : "42501");
      },
    );
  });

  describe("links between rows stay inside one workspace", () => {
    // Keyed by constraint name; the first test fails if a composite FK has no case.
    const CASES: Record<string, () => [string, unknown[]]> = {
      products_workspace_id_integration_id_fkey: () => [
        `insert into products (workspace_id, integration_id, title) values ($1, $2, 'x')`,
        [ws.A, id.B.integration],
      ],
      agent_runs_workspace_id_product_id_fkey: () => [
        `insert into agent_runs (workspace_id, product_id, model, prompt_version) values ($1, $2, 'm', 'v1')`,
        [ws.A, id.B.product],
      ],
      classifications_workspace_id_product_id_fkey: () => [
        `insert into classifications (workspace_id, product_id) values ($1, $2)`,
        [ws.A, id.B.product],
      ],
      classifications_workspace_id_agent_run_id_fkey: () => [
        `insert into classifications (workspace_id, product_id, agent_run_id, is_current) values ($1, $2, $3, false)`,
        [ws.A, id.A.product, id.B.run],
      ],
      agent_questions_workspace_id_product_id_fkey: () => [
        `insert into agent_questions (workspace_id, product_id, question) values ($1, $2, 'q')`,
        [ws.A, id.B.product],
      ],
      agent_questions_workspace_id_agent_run_id_fkey: () => [
        `insert into agent_questions (workspace_id, product_id, agent_run_id, question) values ($1, $2, $3, 'q')`,
        [ws.A, id.A.product, id.B.run],
      ],
      quote_lines_workspace_id_quote_id_fkey: () => [
        `insert into quote_lines (quote_id, workspace_id, quantity) values ($1, $2, 1)`,
        [id.B.quote, ws.A],
      ],
      quote_lines_workspace_id_product_id_fkey: () => [
        `insert into quote_lines (quote_id, workspace_id, product_id, quantity) values ($1, $2, $3, 1)`,
        [id.A.quote, ws.A, id.B.product],
      ],
      alert_items_workspace_id_alert_id_fkey: () => [
        `insert into alert_items (alert_id, workspace_id, product_id) values ($1, $2, $3)`,
        [id.B.alert, ws.A, id.A.product2],
      ],
      alert_items_workspace_id_product_id_fkey: () => [
        `insert into alert_items (alert_id, workspace_id, product_id) values ($1, $2, $3)`,
        [id.A.alert, ws.A, id.B.product],
      ],
      broker_orders_workspace_id_product_id_fkey: () => [
        `insert into broker_orders (workspace_id, product_id) values ($1, $2)`,
        [ws.A, id.B.product],
      ],
    };

    it("has a case for every composite foreign key", async () => {
      const { rows } = await db.query(
        `select conname from pg_constraint
         where contype = 'f' and connamespace = 'public'::regnamespace and array_length(conkey, 1) > 1
         order by 1`,
      );
      expect(rows.map((r) => r.conname).sort()).toEqual(
        Object.keys(CASES).sort(),
      );
    });

    // Run with full privileges inside a rolled-back transaction: the key itself must refuse,
    // whatever RLS would have said (jobs write some of these tables with the service role).
    it.each(Object.keys(CASES))(
      "%s rejects a parent from the other workspace",
      async (name) => {
        const [sql, params] = CASES[name]();
        await db.query("begin");
        try {
          await expect(db.query(sql, params)).rejects.toMatchObject({
            code: "23503",
            constraint: name,
          });
        } finally {
          await db.query("rollback");
        }
      },
    );

    it("every link between tenant tables includes workspace_id", async () => {
      const { rows } = await db.query(
        `select c.conname
         from pg_constraint c
         join pg_attribute src on src.attrelid = c.conrelid and src.attname = 'workspace_id'
         join pg_attribute dst on dst.attrelid = c.confrelid and dst.attname = 'workspace_id'
         where c.contype = 'f' and c.connamespace = 'public'::regnamespace
           and not (src.attnum = any(c.conkey))
         order by 1`,
      );
      expect(rows.map((r) => r.conname)).toEqual([]);
    });

    it("API roles cannot truncate tables", async () => {
      const { rows } = await db.query(
        `select table_name from information_schema.role_table_grants
         where table_schema = 'public' and privilege_type = 'TRUNCATE'
           and grantee in ('anon', 'authenticated')`,
      );
      expect(rows).toEqual([]);
    });

    it("rejects re-pointing an existing row at the other workspace", async () => {
      const code = await errorCode(
        user.ownerA,
        `update classifications set product_id = $1 where id = $2`,
        [id.B.product, id.A.classification],
      );
      expect(code).toBe("23503");
    });
  });

  describe("workspaces", () => {
    it("are visible only to their members", async () => {
      const seen = await as(user.ownerA, async () =>
        (await db.query("select id::text from workspaces")).rows.map(
          (r) => r.id,
        ),
      );
      expect(seen).toEqual([ws.A]);
      expect(
        await as(
          user.outsider,
          async () => (await db.query("select 1 from workspaces")).rowCount,
        ),
      ).toBe(0);
      expect(
        await as(
          null,
          async () => (await db.query("select 1 from workspaces")).rowCount,
        ),
      ).toBe(0);
    });

    it("cannot be created directly by users (the server creates them)", async () => {
      const code = await errorCode(
        user.outsider,
        "insert into workspaces (name, home_country) values ('x', 'US')",
      );
      expect(code).toBe("42501");
    });

    it("cannot be changed or deleted by another workspace", async () => {
      const before = await fingerprint("workspaces", "id = $1", [ws.B]);
      const after = await attemptThenFingerprint(
        user.ownerA,
        ["update workspaces set name = 'x'", "delete from workspaces"],
        "workspaces",
        "id = $1",
        [ws.B],
      );
      expect(after).toBe(before);
    });

    it("settings can be edited by owners and admins only", async () => {
      const sql = "update workspaces set name = 'Renamed' where id = $1";
      expect(
        await as(
          user.adminA,
          async () => (await db.query(sql, [ws.A])).rowCount,
        ),
      ).toBe(1);
      expect(
        await as(
          user.memberA,
          async () => (await db.query(sql, [ws.A])).rowCount,
        ),
      ).toBe(0);
      expect(
        await as(
          user.viewerA,
          async () => (await db.query(sql, [ws.A])).rowCount,
        ),
      ).toBe(0);
    });

    it("cannot be soft-deleted by any client, even the owner", async () => {
      const code = await errorCode(
        user.ownerA,
        "update workspaces set deleted_at = now() where id = $1",
        [ws.A],
      );
      expect(code).toBe("42501");
    });

    it("can be deleted only by an owner", async () => {
      const sql = "delete from workspaces where id = $1";
      expect(
        await as(
          user.adminA,
          async () => (await db.query(sql, [ws.A])).rowCount,
        ),
      ).toBe(0);
      expect(
        await as(
          user.ownerA,
          async () => (await db.query(sql, [ws.A])).rowCount,
        ),
      ).toBe(1);
    });
  });

  describe("profiles", () => {
    it("are created for every new user and visible only to that user", async () => {
      const seen = await as(user.ownerA, async () =>
        (await db.query("select id::text from profiles")).rows.map((r) => r.id),
      );
      expect(seen).toEqual([user.ownerA]);
      expect(
        await as(
          null,
          async () => (await db.query("select 1 from profiles")).rowCount,
        ),
      ).toBe(0);
    });

    it("let users edit their name but never grant platform admin", async () => {
      expect(
        await as(
          user.ownerA,
          async () =>
            (await db.query("update profiles set full_name = 'A'")).rowCount,
        ),
      ).toBe(1);
      const code = await errorCode(
        user.ownerA,
        "update profiles set is_platform_admin = true where id = $1",
        [user.ownerA],
      );
      expect(code).toBe("42501");
      const others = await attemptThenFingerprint(
        user.ownerA,
        ["update profiles set full_name = 'x'", "delete from profiles"],
        "profiles",
        "id = $1",
        [user.ownerB],
      );
      expect(others).toBe(
        await fingerprint("profiles", "id = $1", [user.ownerB]),
      );
    });
  });

  describe("audit_log", () => {
    it("records only the signed-in actor", async () => {
      const sql = `insert into audit_log (workspace_id, actor_id, action) values ($1, $2, 'x')`;
      expect(await errorCode(user.viewerA, sql, [ws.A, user.ownerA])).toBe(
        "42501",
      );
      expect(
        await errorCode(user.viewerA, sql, [ws.A, user.viewerA]),
      ).toBeNull();
    });

    it("cannot be changed or deleted, even by the owner", async () => {
      const before = await fingerprint("audit_log", "workspace_id = $1", [
        ws.A,
      ]);
      const after = await attemptThenFingerprint(
        user.ownerA,
        ["update audit_log set action = 'x'", "delete from audit_log"],
        "audit_log",
        "workspace_id = $1",
        [ws.A],
      );
      expect(after).toBe(before);
    });
  });

  describe("memberships and roles", () => {
    const setRole = `update memberships set role = $3 where workspace_id = $1 and user_id = $2`;

    it("an admin cannot make themselves owner", async () => {
      expect(
        await errorCode(user.adminA, setRole, [ws.A, user.adminA, "owner"]),
      ).toBe("42501");
    });

    it("an admin cannot remove or demote the owner", async () => {
      const before = await fingerprint("memberships", "user_id = $1", [
        user.ownerA,
      ]);
      const after = await attemptThenFingerprint(
        user.adminA,
        [
          `update memberships set role = 'member' where user_id = '${user.ownerA}'`,
          `delete from memberships where user_id = '${user.ownerA}'`,
        ],
        "memberships",
        "user_id = $1",
        [user.ownerA],
      );
      expect(after).toBe(before);
    });

    it("an admin cannot add an owner but can add a member", async () => {
      const sql = `insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)`;
      expect(
        await errorCode(user.adminA, sql, [ws.A, user.outsider, "owner"]),
      ).toBe("42501");
      expect(
        await errorCode(user.adminA, sql, [ws.A, user.outsider, "member"]),
      ).toBeNull();
    });

    it("an owner can add another owner", async () => {
      const sql = `insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')`;
      expect(
        await errorCode(user.ownerA, sql, [ws.A, user.outsider]),
      ).toBeNull();
    });

    it.each([
      ["member", user.memberA],
      ["viewer", user.viewerA],
    ])("a %s cannot change their own role", async (_role, uid) => {
      const before = await fingerprint("memberships", "user_id = $1", [uid]);
      const after = await attemptThenFingerprint(
        uid,
        [
          "update memberships set role = 'admin'",
          "update memberships set role = 'owner'",
        ],
        "memberships",
        "user_id = $1",
        [uid],
      );
      expect(after).toBe(before);
    });

    it("a membership cannot be moved to another user or workspace", async () => {
      const code = await errorCode(
        user.ownerA,
        `update memberships set user_id = $1 where workspace_id = $2 and user_id = $3`,
        [user.outsider, ws.A, user.memberA],
      );
      expect(code).toBe("42501");
    });

    it("the last owner cannot leave or step down", async () => {
      const leave = `delete from memberships where workspace_id = $1 and user_id = $2`;
      expect(await errorCode(user.ownerA, leave, [ws.A, user.ownerA])).toBe(
        "23514",
      );
      expect(
        await errorCode(user.ownerA, setRole, [ws.A, user.ownerA, "admin"]),
      ).toBe("23514");
    });

    it("an owner can step down once another owner exists", async () => {
      const code = await as(user.ownerA, async () => {
        await db.query(setRole, [ws.A, user.adminA, "owner"]);
        await db.query(setRole, [ws.A, user.ownerA, "admin"]);
        try {
          await db.query("set constraints all immediate");
          return null;
        } catch (e) {
          return (e as { code?: string }).code;
        }
      });
      expect(code).toBeNull();
    });
  });

  describe("shared reference data", () => {
    it.each(Object.keys(SHARED_SEED))(
      "%s is readable but not writable by users",
      async (table) => {
        expect(
          await as(
            user.ownerA,
            async () => (await db.query(`select 1 from ${table}`)).rowCount,
          ),
        ).toBeGreaterThan(0);
        expect(
          await as(
            null,
            async () => (await db.query(`select 1 from ${table}`)).rowCount,
          ),
        ).toBe(0);

        const before = await fingerprint(table, "true", []);
        const after = await attemptThenFingerprint(
          user.ownerA,
          [
            `update ${table} set ${SHARED_UPDATE[table]}`,
            `delete from ${table}`,
          ],
          table,
          "true",
          [],
        );
        expect(after).toBe(before);

        await db.query("begin");
        try {
          const insert = SHARED_SEED[table]
            .replace(/iso-test/g, "iso-test-2")
            .replace(/ISO-TEST/g, "ISO-TEST-2");
          await claims(user.ownerA);
          await expect(db.query(insert)).rejects.toMatchObject({
            code: "42501",
          });
        } finally {
          await db.query("rollback");
        }
      },
    );
  });
});
