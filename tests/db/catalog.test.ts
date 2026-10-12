import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { productRowSchema } from "@/lib/catalog/schema";
import { asUser, connect, describeDb, signInAs, tryAs } from "./helpers";

// CD-022: import_products, the database-computed content hash, unique SKUs and product checks,
// run as real signed-in users against a live database.

const ws = randomUUID();
const otherWs = randomUUID();
const user = {
  owner: randomUUID(),
  member: randomUUID(),
  viewer: randomUUID(),
  stranger: randomUUID(),
};

let db: Client;

type Row = Record<string, unknown>;
const row = (sku: string, over: Row = {}): Row => ({
  sku,
  title: `Product ${sku}`,
  description: null,
  product_type: null,
  vendor: null,
  tags: [],
  image_urls: [],
  origin_country: null,
  customs_value: null,
  currency: null,
  weight_kg: null,
  ...over,
});

/** Import as `uid` and commit; returns the counts. */
async function importAs(uid: string, workspace: string, rows: Row[]) {
  await db.query("begin");
  try {
    await signInAs(db, uid);
    const { rows: out } = await db.query(
      "select * from import_products($1, $2::jsonb)",
      [workspace, JSON.stringify(rows)],
    );
    await db.query("commit");
    return out[0] as { inserted: number; updated: number; unchanged: number };
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

async function product(sku: string, workspace = ws) {
  const { rows } = await db.query(
    "select * from products where workspace_id = $1 and sku = $2",
    [workspace, sku],
  );
  return rows[0];
}

describeDb("catalog import (live database)", () => {
  beforeAll(async () => {
    db = await connect();
    await db.query("begin");
    for (const [name, uid] of Object.entries(user))
      await db.query(
        "insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())",
        [uid, `${name}-${ws.slice(0, 8)}@test.local`],
      );
    await db.query(
      "insert into workspaces (id, name, home_country) values ($1, 'W', 'US'), ($2, 'Other', 'US')",
      [ws, otherWs],
    );
    await db.query(
      `insert into memberships (workspace_id, user_id, role) values
        ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'viewer'), ($5, $6, 'owner')`,
      [ws, user.owner, user.member, user.viewer, otherWs, user.stranger],
    );
    await db.query("commit");
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await db.query("rollback").catch(() => {});
      await db.query("delete from workspaces where id = any($1)", [
        [ws, otherWs],
      ]);
      await db.query("delete from auth.users where id = any($1)", [
        Object.values(user),
      ]);
    } finally {
      await db.end();
    }
  });

  it("inserts new SKUs with defaults and a computed content hash", async () => {
    const counts = await importAs(user.member, ws, [
      row("A", {
        tags: ["cotton"],
        origin_country: "CN",
        customs_value: "4.20",
        currency: "USD",
        weight_kg: "0.180",
      }),
      row("B"),
    ]);
    expect(counts).toEqual({ inserted: 2, updated: 0, unchanged: 0 });
    const a = await product("A");
    expect(a).toMatchObject({
      title: "Product A",
      tags: ["cotton"],
      origin_country: "CN",
      customs_value: "4.20",
      weight_kg: "0.180",
      currency: "USD",
      integration_id: null,
    });
    expect(a.content_hash).toMatch(/^[0-9a-f]{64}$/); // SHA-256
  });

  it("updates existing SKUs, keeps stored values for blank cells, and counts unchanged rows", async () => {
    const counts = await importAs(user.member, ws, [
      row("A"), // nothing new
      row("B", {
        title: "Product B v2",
        customs_value: "3.00",
        currency: "EUR",
      }),
      row("C"),
    ]);
    expect(counts).toEqual({ inserted: 1, updated: 1, unchanged: 1 });
    expect(await product("A")).toMatchObject({
      tags: ["cotton"],
      origin_country: "CN",
      customs_value: "4.20",
    });
    expect(await product("B")).toMatchObject({
      title: "Product B v2",
      customs_value: "3.00",
      currency: "EUR",
    });
  });

  it("stores a value with its currency, and keeps both when the value is blank", async () => {
    await importAs(user.member, ws, [
      row("A", { customs_value: "5.00", currency: "GBP" }),
    ]);
    expect(await product("A")).toMatchObject({
      customs_value: "5.00",
      currency: "GBP",
    });
    await importAs(user.member, ws, [row("A")]);
    expect(await product("A")).toMatchObject({
      customs_value: "5.00",
      currency: "GBP",
    });
  });

  it("does not touch products from an integration with the same SKU", async () => {
    const integration = randomUUID();
    await db.query(
      `insert into integrations (id, workspace_id, provider, shop_domain, status)
       values ($1, $2, 'shopify', $3, 'active')`,
      [integration, ws, `${ws.slice(0, 8)}.myshopify.com`],
    );
    await db.query(
      `insert into products (workspace_id, integration_id, external_id, sku, title)
       values ($1, $2, 'gid-1', 'A', 'From Shopify')`,
      [ws, integration],
    );
    await importAs(user.member, ws, [row("A", { title: "From CSV" })]);
    const { rows } = await db.query(
      "select title from products where workspace_id = $1 and sku = 'A' order by title",
      [ws],
    );
    expect(rows.map((r) => r.title)).toEqual(["From CSV", "From Shopify"]);
  });

  it("marks a confirmed code outdated when an import changes the product's content", async () => {
    const b = await product("B");
    const classification = randomUUID();
    await db.query(
      `insert into classifications (id, workspace_id, product_id, code, status, source, is_current, confirmed_at)
       values ($1, $2, $3, '6109100012', 'confirmed', 'ai', true, now())`,
      [classification, ws, b.id],
    );
    const status = async () =>
      (
        await db.query("select status from classifications where id = $1", [
          classification,
        ])
      ).rows[0].status;
    const reconfirm = () =>
      db.query(
        "update classifications set status = 'confirmed' where id = $1",
        [classification],
      );

    // Vendor and origin do not change the code: still confirmed.
    await importAs(user.member, ws, [
      row("B", { title: "Product B v2", vendor: "Acme", origin_country: "VN" }),
    ]);
    expect(await status()).toBe("confirmed");

    // Text, value, weight and images can change the code (value- and weight-split HTS lines).
    for (const change of [
      { title: "Product B, ceramic" },
      { customs_value: "9.99", currency: "USD" },
      { weight_kg: "12.5" },
      { image_urls: ["https://img.test/b.jpg"] },
    ]) {
      await reconfirm();
      await importAs(user.member, ws, [
        row("B", { title: "Product B, ceramic", ...change }),
      ]);
      expect(await status(), JSON.stringify(change)).toBe("outdated");
    }
  });

  it("lets an integration be deleted when its products share SKUs with manual ones", async () => {
    const integration = randomUUID();
    await db.query(
      `insert into integrations (id, workspace_id, provider, shop_domain, status)
       values ($1, $2, 'shopify', $3, 'active')`,
      [integration, ws, `del-${ws.slice(0, 8)}.myshopify.com`],
    );
    await db.query(
      `insert into products (workspace_id, integration_id, external_id, sku, title)
       values ($1, $2, 'gid-a', 'C', 'Shopify C'), ($1, $2, 'gid-b', 'C', 'Shopify C again')`,
      [ws, integration],
    );
    await db.query("delete from integrations where id = $1", [integration]);
    const { rows } = await db.query(
      "select count(*)::int as n from products where workspace_id = $1 and sku = 'C'",
      [ws],
    );
    expect(rows[0].n).toBe(3);
    // A re-import still updates only the manual product.
    const counts = await importAs(user.member, ws, [
      row("C", { title: "Manual C" }),
    ]);
    expect(counts.updated + counts.unchanged).toBe(1);
    expect(counts.inserted).toBe(0);
  });

  it("enforces the import's limits on direct writes too", async () => {
    const insert = (values: Row) =>
      tryAs(
        db,
        user.member,
        `insert into products (workspace_id, title, vendor, product_type, tags, image_urls, customs_value, weight_kg, currency, facts)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          ws,
          values.title ?? "Direct",
          values.vendor ?? null,
          values.product_type ?? null,
          values.tags ?? [],
          values.image_urls ?? [],
          values.customs_value ?? null,
          values.weight_kg ?? null,
          values.currency === undefined ? "USD" : values.currency,
          JSON.stringify(values.facts === undefined ? {} : values.facts),
        ],
      );
    expect(await insert({})).toBeNull();
    expect(
      await insert({ customs_value: "5", facts: { material: "cotton" } }),
    ).toBeNull();
    for (const bad of [
      { title: "   " },
      { vendor: "v".repeat(201) },
      { product_type: "t".repeat(201) },
      { tags: ["x".repeat(101)] },
      { tags: [" "] },
      { image_urls: ["javascript:alert(1)"] },
      { image_urls: ["http://169.254.169.254/latest"] },
      { image_urls: ["data:text/html,<script>1</script>"] },
      { image_urls: [`https://img.test/${"a".repeat(2000)}`] },
      { customs_value: "NaN" },
      { title: "\u00a0" },
      { title: "a\u0001b" },
      { vendor: "a\u001fb" },
      { tags: [null] },
      { tags: ["ok", null] },
      { image_urls: [null] },
      { image_urls: ["https://img.test/a\u0001b"] },
      { image_urls: ["https://img.test/a\u00a0b"] },
      { customs_value: "5", currency: null },
      { facts: ["not", "an", "object"] },
      { facts: { blob: "x".repeat(70000) } },
      { weight_kg: "NaN" },
    ]) {
      expect((await insert(bad))?.code, JSON.stringify(bad).slice(0, 80)).toBe(
        "23514",
      );
    }
  });

  it("accepts every row the shared Zod schema accepts (no drift between the two)", async () => {
    const edges = [
      "\u200b",
      "\u00a0",
      "\u0085",
      "\u3000",
      "\ufeff",
      "\u2007",
      "\t",
      "\n",
      "\u0001",
      "\u007f",
      "a\u200bb",
      "a\u00a0b",
      "a\u0085b",
      "a\tb",
      "a\nb",
      "é™½",
      "😀",
    ];
    const candidates: Row[] = [];
    for (const [i, e] of edges.entries()) {
      candidates.push(
        row(`EDGE-T${i}`, { title: e }),
        row(`EDGE-S${i}${e}`),
        row(`EDGE-D${i}`, { description: e, vendor: e, product_type: e }),
        row(`EDGE-G${i}`, { tags: [e] }),
        row(`EDGE-I${i}`, { image_urls: [`https://img.test/${e}.jpg`] }),
      );
    }
    let accepted = 0;
    for (const candidate of candidates) {
      // The action sends Zod's output (z.url() normalises links, e.g. drops tabs).
      const parsed = productRowSchema.safeParse(candidate);
      if (!parsed.success) continue;
      accepted++;
      const err = await tryAs(
        db,
        user.member,
        "select * from import_products($1, $2::jsonb)",
        [ws, JSON.stringify([parsed.data])],
      );
      expect(err, JSON.stringify(parsed.data)).toBeNull();
    }
    expect(accepted).toBeGreaterThan(20);
  });

  it("refuses imports into a deleted workspace", async () => {
    await db.query("update workspaces set deleted_at = now() where id = $1", [
      ws,
    ]);
    try {
      await expect(importAs(user.member, ws, [row("Z")])).rejects.toMatchObject(
        {
          code: "42501",
        },
      );
    } finally {
      await db.query("update workspaces set deleted_at = null where id = $1", [
        ws,
      ]);
    }
  });

  it("ignores a client-supplied content hash", async () => {
    const before = (await product("C")).content_hash;
    const err = await tryAs(
      db,
      user.member,
      "update products set content_hash = 'forged', title = 'Changed' where workspace_id = $1 and sku = 'C'",
      [ws],
    );
    expect(err).toBeNull();
    await asUser(db, user.member, async () => {
      await db.query(
        "update products set content_hash = 'forged' where workspace_id = $1 and sku = 'C'",
        [ws],
      );
      const { rows } = await db.query(
        "select content_hash from products where workspace_id = $1 and sku = 'C'",
        [ws],
      );
      expect(rows[0].content_hash).toBe(before);
    });
  });

  it("refuses viewers, strangers and anonymous callers", async () => {
    for (const uid of [user.viewer, user.stranger]) {
      await expect(importAs(uid, ws, [row("X")])).rejects.toMatchObject({
        code: "42501",
      });
    }
    const anon = await tryAs(
      db,
      null,
      "select * from import_products($1, $2::jsonb)",
      [ws, JSON.stringify([row("X")])],
    );
    expect(anon?.code).toBe("42501");
    expect(await product("X")).toBeUndefined();
  });

  it("rejects bad batches", async () => {
    const bad = async (rows: unknown, code: string) => {
      const err = await tryAs(
        db,
        user.member,
        "select * from import_products($1, $2::jsonb)",
        [ws, JSON.stringify(rows)],
      );
      expect(err?.code).toBe(code);
    };
    await bad([], "22023");
    await bad({ sku: "A" }, "22023");
    await bad(
      Array.from({ length: 1001 }, (_, i) => row(`S${i}`)),
      "22023",
    );
    await bad([row("D"), row("D")], "23505");
    await bad([row("D", { title: null })], "23502");
    await bad([row("D", { title: "" })], "23502");
    await bad(["just text"], "23502");
    await bad([row("D", { origin_country: "cn" })], "23514");
    await bad([row("D", { customs_value: "-1", currency: "USD" })], "23514");
    await bad([row("D", { customs_value: "1", currency: "dollars" })], "22001"); // char(3)
    await bad([row("D", { customs_value: "1", currency: "us1" })], "23514");
    await bad([row("D", { customs_value: "1" })], "23502"); // value without currency
    await bad([row("D", { currency: "EUR" })], "23502"); // currency without value
    await bad(
      [row("D", { customs_value: "12345678901", currency: "USD" })],
      "22003",
    );
    await bad([row("D", { title: "x".repeat(501) })], "23514");
    await bad(
      [row("D", { tags: Array.from({ length: 251 }, () => "t") })],
      "23514",
    );
  });

  it("ignores a workspace_id smuggled into a row", async () => {
    await importAs(user.member, ws, [row("E", { workspace_id: otherWs })]);
    expect(await product("E")).toBeDefined();
    expect(await product("E", otherWs)).toBeUndefined();
  });

  it("imports 5,000 rows in batches of 500 well under 60 seconds", async () => {
    const start = Date.now();
    for (let b = 0; b < 10; b++) {
      const rows = Array.from({ length: 500 }, (_, i) =>
        row(`BULK-${b * 500 + i}`, {
          description: "Cotton knit T-shirt with short sleeves",
          tags: ["cotton", "menswear"],
          origin_country: "CN",
          customs_value: "4.20",
          currency: "USD",
        }),
      );
      const counts = await importAs(user.member, ws, rows);
      expect(counts.inserted).toBe(500);
    }
    const seconds = (Date.now() - start) / 1000;
    expect(seconds).toBeLessThan(20);
    const { rows } = await db.query(
      "select count(*)::int as n from products where workspace_id = $1 and sku like 'BULK-%'",
      [ws],
    );
    expect(rows[0].n).toBe(5000);
  });
});
