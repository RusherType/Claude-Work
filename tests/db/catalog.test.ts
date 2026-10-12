import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
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
    expect(a.content_hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("updates existing SKUs, keeps stored values for blank cells, and counts unchanged rows", async () => {
    const counts = await importAs(user.member, ws, [
      row("A"), // nothing new
      row("B", { title: "Product B v2", currency: "EUR" }),
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
      currency: "EUR",
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
    // Value-only change: still confirmed.
    await importAs(user.member, ws, [
      row("B", { title: "Product B v2", customs_value: "9.99" }),
    ]);
    const status = async () =>
      (
        await db.query("select status from classifications where id = $1", [
          classification,
        ])
      ).rows[0].status;
    expect(await status()).toBe("confirmed");
    await importAs(user.member, ws, [
      row("B", { title: "Product B, ceramic" }),
    ]);
    expect(await status()).toBe("outdated");
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
    await bad([row("D", { customs_value: "-1" })], "23514");
    await bad([row("D", { currency: "dollars" })], "22001"); // char(3)
    await bad([row("D", { currency: "us1" })], "23514");
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
