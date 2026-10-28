import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, describeDb, signInAs, type DbError } from "./helpers";

// CD-051: saving landed-cost quotes, as real users. Everything runs in a rolled-back transaction.

const ws = randomUUID();
const other = randomUUID();
const user = {
  member: randomUUID(),
  viewer: randomUUID(),
  outsider: randomUUID(),
};
let db: Client;

const quote = {
  name: "November order",
  origin: "CN",
  mode: "express",
  entry_date: "2026-11-01",
  currency: "USD",
  fx_rate_to_usd: "1",
  carrier: "",
  status: "ok",
  totals: { customsValue: "420.00", landedCost: "523.49" },
};
const line = (product: string | null, over: Record<string, unknown> = {}) => ({
  product_id: product,
  quantity: 100,
  unit_value: "4.20",
  code_used: "6109100012",
  used_suggested: false,
  breakdown: { landedCost: "523.49" },
  title: "Crew T-shirt",
  sku: "TEE-1",
  ...over,
});

async function scenario<T>(fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    return await fn();
  } finally {
    await db.query("rollback");
  }
}

async function as<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await signInAs(db, uid);
  try {
    return await fn();
  } finally {
    await db.query("reset role");
  }
}

async function save(
  workspace: string,
  q: unknown,
  lines: unknown,
): Promise<{ id?: string; error?: DbError }> {
  await db.query("savepoint s");
  try {
    const { rows } = await db.query("select save_quote($1, $2, $3) as id", [
      workspace,
      JSON.stringify(q),
      JSON.stringify(lines),
    ]);
    await db.query("release savepoint s");
    return { id: rows[0].id };
  } catch (e) {
    await db.query("rollback to savepoint s");
    const err = e as DbError;
    return { error: { code: err.code, message: err.message } };
  }
}

async function seedProduct(workspace = ws) {
  const id = randomUUID();
  await db.query(
    "insert into products (id, workspace_id, sku, title) values ($1, $2, $3, 'Crew T-shirt')",
    [id, workspace, `TEE-${id.slice(0, 8)}`],
  );
  return id;
}

describeDb("quotes (live database)", () => {
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
      [ws, other],
    );
    await db.query(
      `insert into memberships (workspace_id, user_id, role)
       values ($1, $3, 'member'), ($1, $4, 'viewer'), ($2, $5, 'owner')`,
      [ws, other, user.member, user.viewer, user.outsider],
    );
    await db.query("commit");
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await db.query("rollback").catch(() => {});
      await db.query("delete from workspaces where id = any($1)", [
        [ws, other],
      ]);
      await db.query("delete from auth.users where id = any($1)", [
        Object.values(user),
      ]);
    } finally {
      await db.end();
    }
  });

  it("saves a quote and its lines in order, with who made it", () =>
    scenario(async () => {
      const [p1, p2] = [await seedProduct(), await seedProduct()];
      await as(user.member, async () => {
        const { id, error } = await save(ws, quote, [
          line(p1),
          line(p2, { quantity: 5, used_suggested: true }),
        ]);
        expect(error).toBeUndefined();
        const q = (
          await db.query(
            "select name, created_by, fx_rate_to_usd::text, carrier, destination from quotes where id = $1",
            [id],
          )
        ).rows[0];
        expect(q).toEqual({
          name: "November order",
          created_by: user.member,
          fx_rate_to_usd: "1.00000000",
          carrier: null,
          destination: "US",
        });
        const lines = (
          await db.query(
            "select product_id, quantity, position, used_suggested from quote_lines where quote_id = $1 order by position",
            [id],
          )
        ).rows;
        expect(lines).toEqual([
          { product_id: p1, quantity: 100, position: 1, used_suggested: false },
          { product_id: p2, quantity: 5, position: 2, used_suggested: true },
        ]);
      });
    }));

  it("refuses viewers, other workspaces and anonymous callers", () =>
    scenario(async () => {
      const p = await seedProduct();
      for (const uid of [user.viewer, user.outsider])
        await as(uid, async () => {
          expect((await save(ws, quote, [line(p)])).error?.code).toBe("42501");
        });
      await as(null, async () => {
        expect((await save(ws, quote, [line(p)])).error?.code).toBe("42501");
      });
    }));

  it("refuses a line for another workspace's product", () =>
    scenario(async () => {
      const foreign = await seedProduct(other);
      await as(user.member, async () => {
        expect((await save(ws, quote, [line(foreign)])).error?.code).toBe(
          "23503",
        );
      });
    }));

  it.each([
    [{ name: " " }, []],
    [{ mode: "rail" }, []],
    [{ origin: "c1" }, []],
    [{ fx_rate_to_usd: "0" }, []],
    [{ status: "maybe" }, []],
    [{}, [{ quantity: 0 }]],
    [{}, [{ code_used: "6109" }]],
    [{}, [{ unit_value: "-1" }]],
    [{}, [{ title: "" }]],
  ] as [Record<string, unknown>, Record<string, unknown>[]][])(
    "refuses invalid values (%j, %j)",
    (q, lineOver) =>
      scenario(async () => {
        const p = await seedProduct();
        await as(user.member, async () => {
          const { error } = await save(ws, { ...quote, ...q }, [
            line(p, lineOver[0] ?? {}),
          ]);
          expect(error?.code).toBe("23514");
        });
      }),
  );

  it("refuses no lines or more than 100", () =>
    scenario(async () => {
      const p = await seedProduct();
      await as(user.member, async () => {
        expect((await save(ws, quote, [])).error?.code).toBe("22023");
        expect(
          (
            await save(
              ws,
              quote,
              Array.from({ length: 101 }, () => line(p)),
            )
          ).error?.code,
        ).toBe("22023");
      });
    }));

  describe("after the product is deleted", () => {
    it("keeps the quote line with its title, SKU and code", () =>
      scenario(async () => {
        const p = await seedProduct();
        let id: string | undefined;
        await as(user.member, async () => {
          id = (await save(ws, quote, [line(p)])).id;
          await db.query("delete from products where id = $1", [p]);
        });
        const kept = (
          await db.query(
            "select product_id, title, sku, code_used from quote_lines where quote_id = $1",
            [id],
          )
        ).rows;
        expect(kept).toEqual([
          {
            product_id: null,
            title: "Crew T-shirt",
            sku: "TEE-1",
            code_used: "6109100012",
          },
        ]);
      }));
  });
});
