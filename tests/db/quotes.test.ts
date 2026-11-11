import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, describeDb, signInAs, type DbError } from "./helpers";

// CD-051: saving landed-cost quotes, as real users. Everything runs in a rolled-back transaction.

const ws = randomUUID();
const other = randomUUID();
const user = {
  owner: randomUUID(),
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
  totals: { totals: { customsValue: "420.00", landedCost: "523.49" } },
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
       values ($1, $3, 'member'), ($1, $4, 'viewer'), ($2, $5, 'owner'), ($1, $6, 'owner')`,
      [ws, other, user.member, user.viewer, user.outsider, user.owner],
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

  it("lets owners save too, and writes an audit row", () =>
    scenario(async () => {
      const p = await seedProduct();
      let id: string | undefined;
      await as(user.owner, async () => {
        id = (await save(ws, quote, [line(p)])).id;
        expect(id).toBeDefined();
      });
      const audit = await db.query(
        "select actor_id, action, data from audit_log where entity_id = $1",
        [id],
      );
      expect(audit.rows).toEqual([
        {
          actor_id: user.owner,
          action: "quote.save",
          data: {
            name: "November order",
            status: "ok",
            lines: 1,
            landed_cost: "523.49",
          },
        },
      ]);
    }));

  it("refuses to save into a deleted workspace", () =>
    scenario(async () => {
      const p = await seedProduct();
      await db.query("update workspaces set deleted_at = now() where id = $1", [
        ws,
      ]);
      await as(user.member, async () => {
        expect((await save(ws, quote, [line(p)])).error?.code).toBe("42501");
      });
    }));

  it("refuses anything that is not a quote object with a list of lines", () =>
    scenario(async () => {
      const p = await seedProduct();
      await as(user.member, async () => {
        expect((await save(ws, [quote], [line(p)])).error?.code).toBe("22023");
        expect((await save(ws, quote, { 0: line(p) })).error?.code).toBe(
          "22023",
        );
        expect((await save(ws, "quote", "lines")).error?.code).toBe("22023");
      });
    }));

  it.each([
    [{ fx_rate_to_usd: "NaN" }, {}],
    [{ entry_date: "infinity" }, {}],
    [{ entry_date: "1999-12-31" }, {}],
    [{ totals: { pad: "x".repeat(70_000), n: 1 } }, {}],
    [{}, { unit_value: "NaN" }],
    [{}, { breakdown: { pad: "x".repeat(70_000) } }],
  ] as [Record<string, unknown>, Record<string, unknown>][])(
    "refuses values that are not real figures or are oversized (%j, %j)",
    (q, lineOver) =>
      scenario(async () => {
        const p = await seedProduct();
        await as(user.member, async () => {
          const { error } = await save(ws, { ...quote, ...q }, [
            line(p, lineOver),
          ]);
          expect(error?.code).toBe("23514");
        });
      }),
  );

  it("cannot be written, edited or deleted directly, by anyone", () =>
    scenario(async () => {
      const p = await seedProduct();
      let id: string | undefined;
      await as(user.member, async () => {
        id = (await save(ws, quote, [line(p)])).id;
      });
      const attempt = async (sql: string, params: unknown[]) => {
        await db.query("savepoint w");
        try {
          await db.query(sql, params);
          await db.query("release savepoint w");
          return null;
        } catch (e) {
          await db.query("rollback to savepoint w");
          return (e as DbError).code;
        }
      };
      for (const uid of [user.owner, user.member, user.viewer])
        await as(uid, async () => {
          for (const [sql, params] of [
            ["update quotes set name = 'Edited' where id = $1", [id]],
            ["update quotes set totals = '{}' where id = $1", [id]],
            ["delete from quotes where id = $1", [id]],
            [
              "update quote_lines set used_suggested = false where quote_id = $1",
              [id],
            ],
            ["delete from quote_lines where quote_id = $1", [id]],
            [
              `insert into quotes (workspace_id, name, origin, mode, entry_date, currency,
                 fx_rate_to_usd, status, totals)
               values ($1, 'Direct', 'CN', 'express', '2026-11-01', 'USD', 1, 'ok', '{}')`,
              [ws],
            ],
          ] as [string, unknown[]][])
            expect(await attempt(sql, params), sql).toBe("42501");
        });
      const kept = await db.query("select name from quotes where id = $1", [
        id,
      ]);
      expect(kept.rows).toEqual([{ name: "November order" }]);
    }));

  it("keeps one line per position (so at most 100 lines per quote)", () =>
    scenario(async () => {
      const p = await seedProduct();
      let id: string | undefined;
      await as(user.member, async () => {
        id = (await save(ws, quote, [line(p)])).id;
      });
      // Even the table owner cannot add a second line at a position.
      await db.query("savepoint dup");
      const dup = await db
        .query(
          `insert into quote_lines (quote_id, workspace_id, quantity, unit_value, code_used,
             title, position, breakdown)
           values ($1, $2, 1, 1, '6109100012', 'Tee', 1, '{}')`,
          [id, ws],
        )
        .then(
          () => null,
          (e: DbError) => e.code,
        );
      await db.query("rollback to savepoint dup");
      expect(dup).toBe("23505");
    }));

  describe("revision_on", () => {
    it("picks the tariff revision in force on the entry date", () =>
      scenario(async () => {
        const [older, newer] = [randomUUID(), randomUUID()];
        await db.query(
          `insert into tariff_revisions (id, market, label, effective_from) values
           ($1, 'US', $3, '2090-01-01'), ($2, 'US', $4, '2090-07-01')`,
          [older, newer, `q-${older}`, `q-${newer}`],
        );
        await as(user.viewer, async () => {
          const on = async (day: string) =>
            (await db.query("select revision_on('US', $1) as id", [day]))
              .rows[0].id;
          expect(await on("2090-03-01")).toBe(older);
          expect(await on("2090-07-01")).toBe(newer);
          expect(await on("2091-01-01")).toBe(newer);
        });
        const none = await db.query(
          "select revision_on('US', '1900-01-01') as id",
        );
        expect(none.rows[0].id).toBeNull();
      }));
  });

  it("refuses a quote or line with missing fields", () =>
    scenario(async () => {
      const p = await seedProduct();
      await as(user.member, async () => {
        expect((await save(ws, { name: "nulls" }, [line(p)])).error?.code).toBe(
          "23502",
        );
        expect(
          (
            await save(ws, quote, [
              { quantity: 1, unit_value: "1", title: "t", product_id: p },
            ])
          ).error?.code,
        ).toBe("23502");
        for (const key of [
          "origin",
          "mode",
          "entry_date",
          "currency",
          "status",
        ])
          expect(
            (await save(ws, { ...quote, [key]: undefined }, [line(p)])).error
              ?.code,
            key,
          ).toBe("23502");
      });
    }));

  it("keeps a non-money total out of the audit row", () =>
    scenario(async () => {
      const p = await seedProduct();
      let id: string | undefined;
      await as(user.member, async () => {
        id = (
          await save(
            ws,
            { ...quote, totals: { totals: { landedCost: { pad: "x" } } } },
            [line(p)],
          )
        ).id;
      });
      const audit = await db.query(
        "select data ->> 'landed_cost' as landed from audit_log where entity_id = $1",
        [id],
      );
      expect(audit.rows).toEqual([{ landed: null }]);
    }));

  describe("limits that hold however save_quote is called", () => {
    const filler = (n: number, createdBy: string | null, age: string) =>
      db.query(
        `insert into quotes (workspace_id, name, origin, mode, entry_date, currency,
           fx_rate_to_usd, status, totals, created_by, created_at)
         select $1, 'Filler ' || g, 'CN', 'express', '2026-11-01', 'USD', 1, 'ok', '{}', $3,
                now() - $4::interval
         from generate_series(1, $2) g`,
        [ws, n, createdBy, age],
      );

    it("at most 60 saves per person per hour", () =>
      scenario(async () => {
        const p = await seedProduct();
        // The trigger sets created_by to the signed-in user, so fill as that user's rows.
        await db.query("alter table quotes disable trigger quotes_created_by");
        await filler(59, user.member, "10 minutes");
        await filler(30, user.member, "2 hours");
        await filler(30, user.owner, "10 minutes");
        await db.query("alter table quotes enable trigger quotes_created_by");
        await as(user.member, async () => {
          expect((await save(ws, quote, [line(p)])).error).toBeUndefined();
          expect((await save(ws, quote, [line(p)])).error?.message).toBe(
            "too_many_quotes",
          );
        });
        // Someone else in the workspace is not held back by it.
        await as(user.owner, async () => {
          expect((await save(ws, quote, [line(p)])).error).toBeUndefined();
        });
      }));

    it("at most 2,000 quotes per workspace", () =>
      scenario(async () => {
        const p = await seedProduct();
        await filler(1999, null, "2 days");
        await as(user.member, async () => {
          expect((await save(ws, quote, [line(p)])).error).toBeUndefined();
          expect((await save(ws, quote, [line(p)])).error?.message).toBe(
            "quote_limit",
          );
        });
      }));
  });

  describe("delete_quote", () => {
    const remove = async (id: string | undefined) => {
      await db.query("savepoint d");
      try {
        await db.query("select delete_quote($1)", [id]);
        await db.query("release savepoint d");
        return null;
      } catch (e) {
        await db.query("rollback to savepoint d");
        return (e as DbError).code;
      }
    };

    it("lets an owner delete a quote and its lines, and logs it", () =>
      scenario(async () => {
        const p = await seedProduct();
        let id: string | undefined;
        await as(user.member, async () => {
          id = (await save(ws, quote, [line(p)])).id;
        });
        for (const uid of [user.member, user.viewer, user.outsider, null])
          await as(uid, async () => {
            expect(await remove(id)).toBe("42501");
          });
        await as(user.owner, async () => {
          expect(await remove(id)).toBeNull();
          expect(await remove(id)).toBe("42501"); // already gone
          expect(await remove(randomUUID())).toBe("42501");
        });
        const left = await db.query(
          `select (select count(*)::int from quotes where id = $1) as quotes,
                  (select count(*)::int from quote_lines where quote_id = $1) as lines`,
          [id],
        );
        expect(left.rows[0]).toEqual({ quotes: 0, lines: 0 });
        const audit = await db.query(
          "select actor_id, action, data from audit_log where entity_id = $1 order by id",
          [id],
        );
        expect(audit.rows.at(-1)).toEqual({
          actor_id: user.owner,
          action: "quote.delete",
          data: { name: "November order" },
        });
      }));
  });
});
