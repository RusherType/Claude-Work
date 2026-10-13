import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { asUser, connect, describeDb } from "./helpers";

// CD-023: catalog_items and catalog_facets on a 10,000-product workspace, as a signed-in member.

const ws = randomUUID();
const member = randomUUID();
const N = 10_000;
let db: Client;

describeDb("catalog view (live database)", () => {
  beforeAll(async () => {
    db = await connect();
    await db.query("begin");
    await db.query(
      "insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())",
      [member, `catalog-${ws.slice(0, 8)}@test.local`],
    );
    await db.query(
      "insert into workspaces (id, name, home_country) values ($1, 'Big catalog', 'US')",
      [ws],
    );
    await db.query(
      "insert into memberships (workspace_id, user_id, role) values ($1, $2, 'member')",
      [ws, member],
    );
    // 10,000 products: every 10th a mug from VN, the rest T-shirts from CN.
    await db.query(
      `insert into products (workspace_id, sku, title, origin_country, image_urls, created_at)
       select $1, 'SKU-' || g,
              case when g % 10 = 0 then 'Ceramic mug ' || g else 'Cotton T-shirt ' || g end,
              case when g % 10 = 0 then 'VN' else 'CN' end,
              array['https://img.test/' || g || '.jpg'],
              now() - make_interval(secs => g)
       from generate_series(1, $2::int) g`,
      [ws, N],
    );
    // Half are classified: an old superseded row and a current one for each.
    await db.query(
      `insert into classifications (workspace_id, product_id, code, status, is_current)
       select workspace_id, id, '6109100012', 'suggested', false
       from products where workspace_id = $1 and (substring(sku from 5))::int % 2 = 0`,
      [ws],
    );
    await db.query(
      `insert into classifications (workspace_id, product_id, code, status, is_current)
       select workspace_id, id,
              case when title like 'Ceramic%' then '6912004400' else '6109100012' end,
              case when (substring(sku from 5))::int % 4 = 0 then 'confirmed' else 'suggested' end::class_status,
              true
       from products where workspace_id = $1 and (substring(sku from 5))::int % 2 = 0`,
      [ws],
    );
    await db.query("commit");
    await db.query("analyze products; analyze classifications");
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    try {
      await db.query("rollback").catch(() => {});
      await db.query("delete from workspaces where id = $1", [ws]);
      await db.query("delete from auth.users where id = $1", [member]);
    } finally {
      await db.end();
    }
  });

  const timed = async <T>(fn: () => Promise<T>) => {
    const start = performance.now();
    const result = await fn();
    return { result, ms: performance.now() - start };
  };

  it("shows each product once with its current classification", async () => {
    await asUser(db, member, async () => {
      const { rows } = await db.query(
        "select count(*)::int as n, count(code)::int as classified from catalog_items where workspace_id = $1",
        [ws],
      );
      expect(rows[0]).toEqual({ n: N, classified: N / 2 });
      const mug = await db.query(
        "select code, chapter, status, image_url from catalog_items where workspace_id = $1 and sku = 'SKU-20'",
        [ws],
      );
      expect(mug.rows[0]).toEqual({
        code: "6912004400",
        chapter: "69",
        status: "confirmed",
        image_url: "https://img.test/20.jpg",
      });
    });
  });

  it("counts statuses, origins and chapters for the filters", async () => {
    await asUser(db, member, async () => {
      const { rows } = await db.query(
        "select facet, value, products::int from catalog_facets($1)",
        [ws],
      );
      const get = (facet: string) =>
        Object.fromEntries(
          rows
            .filter((r) => r.facet === facet)
            .map((r) => [r.value, r.products]),
        );
      expect(get("status")).toEqual({
        confirmed: 2500,
        suggested: 2500,
        unclassified: 5000,
      });
      expect(get("origin")).toEqual({ CN: 9000, VN: 1000 });
      expect(get("chapter")).toEqual({ "61": 4000, "69": 1000 });
    });
  });

  it("pages, filters and searches 10,000 products quickly", async () => {
    await asUser(db, member, async () => {
      const page = (where: string, params: unknown[]) =>
        timed(() =>
          Promise.all([
            db.query(
              `select id, title, sku, code, status from catalog_items
               where workspace_id = $1 ${where} order by created_at desc limit 50 offset 100`,
              [ws, ...params],
            ),
            db.query(
              `select count(*)::int as n from catalog_items where workspace_id = $1 ${where}`,
              [ws, ...params],
            ),
          ]),
        );
      // Warm up once, then time the real queries.
      await page("", []);
      const cases: [string, unknown[], number][] = [
        ["", [], N],
        ["and status = 'confirmed'", [], 2500],
        ["and status is null", [], 5000],
        ["and origin_country = $2", ["VN"], 1000],
        ["and chapter = $2", ["69"], 1000],
        [
          "and (title ilike $2 or sku ilike $2 or code like $3)",
          ["%mug 99%", "6912%"],
          1000,
        ],
      ];
      for (const [where, params, expected] of cases) {
        const { result, ms } = await page(where, params);
        expect(result[1].rows[0].n, where).toBe(expected);
        expect(ms, where).toBeLessThan(500);
      }
      const facets = await timed(() =>
        db.query("select * from catalog_facets($1)", [ws]),
      );
      expect(facets.ms).toBeLessThan(500);
    });
  });
});
