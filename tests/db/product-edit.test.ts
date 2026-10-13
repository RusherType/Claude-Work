import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  changedColumns,
  formToProductEdit,
  productEditSchema,
} from "@/lib/catalog/product-edit";
import { asUser, connect, describeDb } from "./helpers";

// CD-024: what the product page saves, as real users: facts edits mark a confirmed code
// Outdated, viewers cannot change anything, and a stale version changes nothing.

const ws = randomUUID();
const user = { member: randomUUID(), viewer: randomUUID() };
const product = randomUUID();
const classification = randomUUID();
let db: Client;

/** The update the server action sends, built from a form like the page's. */
function edit(entries: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries({ title: "Crew T-shirt", ...entries }))
    form.append(k, v);
  return productEditSchema.parse(formToProductEdit(form));
}

async function updateAs(
  uid: string,
  values: Record<string, unknown>,
  version: string,
) {
  return asUser(db, uid, async () => {
    const cols = Object.keys(values);
    const { rowCount } = await db.query(
      `update products set ${cols.map((c, i) => `${c} = $${i + 3}`).join(", ")}
       where id = $1 and updated_at = $2`,
      [
        product,
        version,
        ...cols.map((c) =>
          c === "facts" ? JSON.stringify(values[c]) : values[c],
        ),
      ],
    );
    // asUser rolls back; commit by repeating outside when needed.
    return rowCount;
  });
}

const state = async () =>
  (
    await db.query(
      // As text, like the app gets it: a JS Date would drop the microseconds.
      `select p.updated_at::text as updated_at, c.status from products p
       join classifications c on c.product_id = p.id where p.id = $1`,
      [product],
    )
  ).rows[0] as { updated_at: string; status: string };

describeDb("product edits (live database)", () => {
  beforeAll(async () => {
    db = await connect();
    await db.query("begin");
    for (const [name, uid] of Object.entries(user))
      await db.query(
        "insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())",
        [uid, `${name}-${ws.slice(0, 8)}@test.local`],
      );
    await db.query(
      "insert into workspaces (id, name, home_country) values ($1, 'W', 'US')",
      [ws],
    );
    await db.query(
      `insert into memberships (workspace_id, user_id, role) values ($1, $2, 'member'), ($1, $3, 'viewer')`,
      [ws, user.member, user.viewer],
    );
    await db.query(
      'insert into products (id, workspace_id, sku, title, facts) values ($1, $2, \'TEE-1\', \'Crew T-shirt\', \'{"materials":[{"name":"Cotton","percent":"100"}],"function":null,"user":null,"form":null}\')',
      [product, ws],
    );
    await db.query(
      `insert into classifications (id, workspace_id, product_id, code, status, is_current, confirmed_at)
       values ($1, $2, $3, '6109100012', 'confirmed', true, now())`,
      [classification, ws, product],
    );
    await db.query("commit");
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await db.query("rollback").catch(() => {});
      await db.query("delete from workspaces where id = $1", [ws]);
      await db.query("delete from auth.users where id = any($1)", [
        Object.values(user),
      ]);
    } finally {
      await db.end();
    }
  });

  it("viewers change nothing", async () => {
    const { updated_at } = await state();
    const values = edit({
      material_0_name: "Polyester",
      material_0_percent: "100",
    });
    expect(await updateAs(user.viewer, values, updated_at)).toBe(0);
  });

  it("a stale version changes nothing", async () => {
    const values = edit({
      material_0_name: "Polyester",
      material_0_percent: "100",
    });
    expect(await updateAs(user.member, values, "2000-01-01T00:00:00Z")).toBe(0);
  });

  it("changing the facts of a confirmed product marks its code Outdated", async () => {
    const { updated_at } = await state();
    const values = edit({
      material_0_name: "Polyester",
      material_0_percent: "100",
    });
    // Commit for real (asUser rolls back): run the same statement as the member.
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: user.member, role: "authenticated" }),
    ]);
    const res = await db.query(
      "update products set facts = $3, title = $4 where id = $1 and updated_at = $2",
      [product, updated_at, JSON.stringify(values.facts), values.title],
    );
    await db.query("commit");
    expect(res.rowCount).toBe(1);
    expect((await state()).status).toBe("outdated");
  });

  it("re-saving the same values does not mark a re-confirmed code Outdated", async () => {
    await db.query(
      "update classifications set status = 'confirmed' where id = $1",
      [classification],
    );
    const { updated_at } = await state();
    const facts = (
      await db.query("select facts from products where id = $1", [product])
    ).rows[0].facts;
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: user.member, role: "authenticated" }),
    ]);
    await db.query(
      "update products set facts = $3 where id = $1 and updated_at = $2",
      [product, updated_at, JSON.stringify(facts)],
    );
    await db.query("commit");
    expect((await state()).status).toBe("confirmed");
  });

  it("saving an imported confirmed product with only vendor and origin changed keeps it confirmed", async () => {
    // Shaped exactly as import_products stores it: facts {}, empty lists, USD with no value.
    const imported = randomUUID();
    await db.query(
      `insert into products (id, workspace_id, sku, title, origin_country, currency, tags, image_urls)
       values ($1, $2, 'IMP-1', 'Ceramic mug', 'CN', 'USD', '{}', '{}')`,
      [imported, ws],
    );
    const cls = randomUUID();
    await db.query(
      `insert into classifications (id, workspace_id, product_id, code, status, is_current, confirmed_at)
       values ($1, $2, $3, '6912004400', 'confirmed', true, now())`,
      [cls, ws, imported],
    );
    const stored = (
      await db.query(
        `select title, description, product_type, vendor, tags, image_urls, origin_country,
                customs_value::text, currency, weight_kg::text, facts, updated_at::text
         from products where id = $1`,
        [imported],
      )
    ).rows[0];
    // The page shows the stored values; the person changes only vendor and origin.
    const form = new FormData();
    for (const [k, v] of Object.entries({
      title: "Ceramic mug",
      vendor: "Acme",
      origin_country: "VN",
      currency: "USD",
    }))
      form.append(k, v);
    const changes = changedColumns(
      productEditSchema.parse(formToProductEdit(form)),
      stored,
    );
    expect(changes).toEqual({ vendor: "Acme", origin_country: "VN" });
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: user.member, role: "authenticated" }),
    ]);
    const cols = Object.keys(changes);
    const res = await db.query(
      `update products set ${cols.map((c, i) => `${c} = $${i + 3}`).join(", ")}
       where id = $1 and updated_at = $2`,
      [
        imported,
        stored.updated_at,
        ...cols.map((c) => changes[c as keyof typeof changes]),
      ],
    );
    await db.query("commit");
    expect(res.rowCount).toBe(1);
    const status = (
      await db.query("select status from classifications where id = $1", [cls])
    ).rows[0].status;
    expect(status).toBe("confirmed");
  });
});
