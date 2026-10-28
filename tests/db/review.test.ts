import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, describeDb, signInAs, type DbError } from "./helpers";
import type { Client as PgClient } from "pg";

// CD-040/041: the review queue and the functions people decide codes with, as real users.
// Every test runs in a transaction that is rolled back; tariff data is seeded inside it.

const ws = randomUUID();
const other = randomUUID();
const user = {
  admin: randomUUID(),
  member: randomUUID(),
  viewer: randomUUID(),
  outsider: randomUUID(),
};
let db: Client;

const TEE = "6109100012";
const TEE_OTHER = "6109100040";

/** A revision in force since yesterday with a small outline, and one starting tomorrow. */
async function seedTariff() {
  const rev = randomUUID();
  const future = randomUUID();
  await db.query(
    `insert into tariff_revisions (id, market, label, effective_from) values
     ($1, 'US', $3, current_date - 1), ($2, 'US', $4, current_date + 1)`,
    [rev, future, `test-${rev}`, `test-${future}`],
  );
  // Schedule order matters: the breadcrumb is the closest line above at each indent.
  const lines: [string, number, string, boolean][] = [
    ["6109", 0, "T-shirts, singlets, tank tops, knitted", false],
    ["61091000", 1, "Of cotton", false],
    ["", 2, "Men's or boys':", false],
    [TEE, 3, "T-shirts, all white", true],
    [TEE_OTHER, 3, "Other T-shirts", true],
    ["61099010", 1, "Of other textile materials", true],
  ];
  for (const [code, indent, description, leaf] of lines)
    await db.query(
      `insert into tariff_lines (revision_id, code, indent, description, is_leaf)
       values ($1, $2, $3, $4, $5)`,
      [rev, code, indent, description, leaf],
    );
  // The future revision has the T-shirt but not the "other" line.
  await db.query(
    `insert into tariff_lines (revision_id, code, indent, description, is_leaf)
     values ($1, $2, 3, 'T-shirts, all white', true)`,
    [future, TEE],
  );
  return rev;
}

async function seedProduct(
  workspace = ws,
  cls?: { status: string; code?: string | null; created?: string },
) {
  const product = randomUUID();
  await db.query(
    `insert into products (id, workspace_id, sku, title) values ($1, $2, $3, 'Crew T-shirt')`,
    [product, workspace, `SKU-${product.slice(0, 8)}`],
  );
  const hash = (
    await db.query("select content_hash from products where id = $1", [product])
  ).rows[0].content_hash as string;
  let classification: string | null = null;
  if (cls) {
    classification = randomUUID();
    await db.query(
      `insert into classifications (id, workspace_id, product_id, code, status, confidence, created_at)
       values ($1, $2, $3, $4, $5, 0.9, coalesce($6::timestamptz, now()))`,
      [
        classification,
        workspace,
        product,
        cls.code === undefined ? TEE : cls.code,
        cls.status,
        cls.created ?? null,
      ],
    );
  }
  return { product, hash, classification };
}

/** Seed as the table owner, then act as `uid`; everything is rolled back. */
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
    await db.query("select set_config('request.jwt.claims', '', true)");
  }
}

/** Runs one call inside a savepoint so a failure leaves the scenario usable. */
async function attempt(
  sql: string,
  params: unknown[],
): Promise<DbError | null> {
  await db.query("savepoint s");
  try {
    await db.query(sql, params);
    await db.query("release savepoint s");
    return null;
  } catch (e) {
    await db.query("rollback to savepoint s");
    const err = e as DbError;
    return { code: err.code, message: err.message };
  }
}

type Seen = { code: string | null; status: string | null };

/** What the page showed for a classification: read as the table owner (state before acting). */
async function seen(id: string | null): Promise<Seen> {
  if (!id) return { code: null, status: null };
  await db.query("savepoint look");
  await db.query("set local role postgres");
  const row = (
    await db.query("select code, status from classifications where id = $1", [
      id,
    ])
  ).rows[0];
  await db.query("rollback to savepoint look");
  return row ?? { code: null, status: null };
}

/** Confirm as the page does: with the code it showed (by default, the stored one). */
const confirm = async (id: string | null, hash: string, code?: string | null) =>
  attempt("select confirm_classification($1, $2, $3)", [
    id,
    code === undefined ? (await seen(id)).code : code,
    hash,
  ]);
const override = async (
  product: string,
  expected: string | null,
  code: string,
  reason: string,
  hash: string,
  shown?: Seen,
) => {
  const s = shown ?? (await seen(expected));
  return attempt("select override_classification($1, $2, $3, $4, $5, $6, $7)", [
    product,
    expected,
    s.code,
    s.status,
    code,
    reason,
    hash,
  ]);
};

describeDb("review queue and decisions (live database)", () => {
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
       values ($1, $3, 'member'), ($1, $4, 'viewer'), ($2, $5, 'owner'), ($1, $6, 'admin')`,
      [ws, other, user.member, user.viewer, user.outsider, user.admin],
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

  describe("confirm_classification", () => {
    it("confirms a suggested code, records who and when, and writes an audit row", () =>
      scenario(async () => {
        const rev = await seedTariff();
        const { product, hash, classification } = await seedProduct(ws, {
          status: "suggested",
        });
        await as(user.member, async () => {
          expect(await confirm(classification, hash)).toBeNull();
          const row = (
            await db.query(
              "select status, source, confirmed_by, confirmed_at, tariff_revision_id from classifications where id = $1",
              [classification],
            )
          ).rows[0];
          expect(row).toMatchObject({
            status: "confirmed",
            source: "ai",
            confirmed_by: user.member,
            tariff_revision_id: rev,
          });
          expect(row.confirmed_at).not.toBeNull();
          const audit = (
            await db.query(
              "select actor_id, action, data from audit_log where entity_id = $1",
              [classification],
            )
          ).rows;
          expect(audit).toEqual([
            {
              actor_id: user.member,
              action: "classification.confirm",
              data: {
                product_id: product,
                market: "US",
                code: TEE,
                previous_status: "suggested",
                confidence: 0.9,
                agent_run_id: null,
                tariff_revision_id: rev,
                content_hash: hash,
              },
            },
          ]);
          // The catalog chip reads the same row.
          const chip = await db.query(
            "select status from catalog_items where id = $1",
            [product],
          );
          expect(chip.rows[0].status).toBe("confirmed");
        });
      }));

    it.each(["in_review", "outdated"])("confirms a code that is %s", (status) =>
      scenario(async () => {
        await seedTariff();
        const { hash, classification } = await seedProduct(ws, { status });
        await as(user.member, async () => {
          expect(await confirm(classification, hash)).toBeNull();
        });
      }),
    );

    it("refuses viewers, other workspaces and anonymous callers", () =>
      scenario(async () => {
        await seedTariff();
        const { hash, classification } = await seedProduct(ws, {
          status: "suggested",
        });
        for (const uid of [user.viewer, user.outsider])
          await as(uid, async () => {
            expect((await confirm(classification, hash))?.code).toBe("42501");
          });
        await as(null, async () => {
          expect((await confirm(classification, hash))?.code).toBe("42501");
        });
        const status = (
          await db.query("select status from classifications where id = $1", [
            classification,
          ])
        ).rows[0].status;
        expect(status).toBe("suggested");
      }));

    it("refuses when the product changed after the page loaded, or the code was replaced", () =>
      scenario(async () => {
        await seedTariff();
        const { product, hash, classification } = await seedProduct(ws, {
          status: "suggested",
        });
        await db.query(
          "update products set title = 'Crew T-shirt, slim' where id = $1",
          [product],
        );
        await as(user.member, async () => {
          expect((await confirm(classification, hash))?.message).toBe("stale");
        });
        const fresh = (
          await db.query("select content_hash from products where id = $1", [
            product,
          ])
        ).rows[0].content_hash;
        await db.query(
          "update classifications set is_current = false where id = $1",
          [classification],
        );
        await as(user.member, async () => {
          expect((await confirm(classification, fresh))?.message).toBe("stale");
        });
      }));

    it.each([
      ["needs_answer", TEE],
      ["queued", TEE],
      ["confirmed", TEE],
      ["broker_verified", TEE],
      ["suggested", null],
    ])("does not confirm a %s code (code %s)", (status, code) =>
      scenario(async () => {
        await seedTariff();
        const { hash, classification } = await seedProduct(ws, {
          status,
          code,
        });
        await as(user.member, async () => {
          expect((await confirm(classification, hash))?.message).toBe(
            "not_confirmable",
          );
        });
      }),
    );

    it("does not confirm a code that is not a filing line of the tariff in force", () =>
      scenario(async () => {
        await seedTariff();
        for (const code of ["61091000", "6109900000", "6109"]) {
          const { hash, classification } = await seedProduct(ws, {
            status: "suggested",
            code,
          });
          await as(user.member, async () => {
            expect((await confirm(classification, hash))?.message).toBe(
              "unknown_code",
            );
          });
        }
      }));
  });

  describe("override_classification", () => {
    it("replaces the code, keeps the old one as history and logs the reason", () =>
      scenario(async () => {
        await seedTariff();
        const { product, hash, classification } = await seedProduct(ws, {
          status: "suggested",
        });
        await as(user.member, async () => {
          expect(
            await override(
              product,
              classification,
              TEE_OTHER,
              "  Printed design, not all white  ",
              hash,
            ),
          ).toBeNull();
          const rows = (
            await db.query(
              `select id, code, status, source, override_reason, confirmed_by, is_current
               from classifications where product_id = $1 order by is_current`,
              [product],
            )
          ).rows;
          expect(rows).toHaveLength(2);
          expect(rows[0]).toMatchObject({
            id: classification,
            code: TEE,
            status: "suggested",
            is_current: false,
          });
          expect(rows[1]).toMatchObject({
            code: TEE_OTHER,
            status: "confirmed",
            source: "override",
            override_reason: "Printed design, not all white",
            confirmed_by: user.member,
            is_current: true,
          });
          const audit = (
            await db.query(
              "select action, data from audit_log where entity_id = $1",
              [rows[1].id],
            )
          ).rows[0];
          expect(audit.action).toBe("classification.override");
          expect(audit.data).toMatchObject({
            code: TEE_OTHER,
            previous_code: TEE,
            previous_status: "suggested",
            previous_id: classification,
            reason: "Printed design, not all white",
          });
        });
      }));

    it("sets the first code of a product that has none", () =>
      scenario(async () => {
        await seedTariff();
        const { product, hash } = await seedProduct(ws);
        await as(user.member, async () => {
          expect(
            await override(product, null, TEE, "Checked with our broker", hash),
          ).toBeNull();
          const chip = await db.query(
            "select status, code from catalog_items where id = $1",
            [product],
          );
          expect(chip.rows[0]).toEqual({ status: "confirmed", code: TEE });
        });
      }));

    it("refuses a stale view, a bad reason, a non-filing code and other roles", () =>
      scenario(async () => {
        await seedTariff();
        const { product, hash, classification } = await seedProduct(ws, {
          status: "suggested",
        });
        await as(user.member, async () => {
          expect(
            (await override(product, null, TEE, "Reason here", hash))?.message,
          ).toBe("stale");
          expect(
            (
              await override(
                product,
                classification,
                TEE,
                "Reason here",
                "nope",
              )
            )?.message,
          ).toBe("stale");
          for (const reason of ["", "  ", "no", "bad\u0001reason"])
            expect(
              (await override(product, classification, TEE, reason, hash))
                ?.code,
            ).toBe("22023");
          expect(
            (
              await override(
                product,
                classification,
                "61091000",
                "Reason here",
                hash,
              )
            )?.message,
          ).toBe("unknown_code");
        });
        for (const uid of [user.viewer, user.outsider, null])
          await as(uid, async () => {
            expect(
              (
                await override(
                  product,
                  classification,
                  TEE,
                  "Reason here",
                  hash,
                )
              )?.code,
            ).toBe("42501");
          });
      }));

    it("an overridden code is marked Outdated when the product changes, and comes back to the queue", () =>
      scenario(async () => {
        await seedTariff();
        const { product, hash } = await seedProduct(ws);
        await as(user.member, async () => {
          expect(
            await override(product, null, TEE, "Checked by hand", hash),
          ).toBeNull();
          await db.query(
            "update products set description = 'Now with a pocket' where id = $1",
            [product],
          );
          const queued = await db.query(
            "select status from review_queue where product_id = $1",
            [product],
          );
          expect(queued.rows).toEqual([{ status: "outdated" }]);
        });
      }));
  });

  describe("answer_agent_question", () => {
    async function seedQuestions(n: number) {
      const { product, classification } = await seedProduct(ws, {
        status: "needs_answer",
        code: null,
      });
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        const id = randomUUID();
        await db.query(
          `insert into agent_questions (id, workspace_id, product_id, question, options)
           values ($1, $2, $3, $4, '["Knitted","Woven"]')`,
          [id, ws, product, `Question ${i}?`],
        );
        ids.push(id);
      }
      return { product, classification, ids };
    }
    const answer = (id: string, text: string) =>
      attempt("select answer_agent_question($1, $2)", [id, text]);
    const status = async (id: string | null) =>
      (await db.query("select status from classifications where id = $1", [id]))
        .rows[0].status;

    it("stores answers and queues the product once the last one is answered", () =>
      scenario(async () => {
        const { classification, ids } = await seedQuestions(2);
        await as(user.member, async () => {
          expect(await answer(ids[0], " Knitted ")).toBeNull();
          expect(await status(classification)).toBe("needs_answer");
          expect(await answer(ids[1], "Cotton jersey")).toBeNull();
          expect(await status(classification)).toBe("queued");
          const q = (
            await db.query(
              "select answer, answered_by from agent_questions where id = $1",
              [ids[0]],
            )
          ).rows[0];
          expect(q).toEqual({ answer: "Knitted", answered_by: user.member });
          expect((await answer(ids[0], "Woven"))?.message).toBe(
            "already_answered",
          );
          const audit = await db.query(
            "select count(*)::int as n from audit_log where action = 'question.answer' and entity_id = any($1)",
            [ids],
          );
          expect(audit.rows[0].n).toBe(2);
        });
      }));

    it("refuses blank answers and other roles", () =>
      scenario(async () => {
        const { ids } = await seedQuestions(1);
        await as(user.member, async () => {
          for (const text of ["", "   ", "x".repeat(301)])
            expect((await answer(ids[0], text))?.code).toBe("22023");
        });
        for (const uid of [user.viewer, user.outsider, null])
          await as(uid, async () => {
            expect((await answer(ids[0], "Knitted"))?.code).toBe("42501");
          });
      }));
  });

  describe("review_position", () => {
    const position = (at: string | null) =>
      db
        .query(
          `select id, prev_id, next_id, "position"::int, total::int from review_position($1, $2)`,
          [ws, at],
        )
        .then((r) => r.rows[0] ?? null);

    it("orders questions, then low confidence, then outdated, then suggestions, oldest first", () =>
      scenario(async () => {
        const s1 = await seedProduct(ws, {
          status: "suggested",
          created: "2026-01-01",
        });
        const out = await seedProduct(ws, {
          status: "outdated",
          created: "2026-01-03",
        });
        const rev = await seedProduct(ws, {
          status: "in_review",
          created: "2026-01-04",
        });
        const ask = await seedProduct(ws, {
          status: "needs_answer",
          created: "2026-01-05",
        });
        const s2 = await seedProduct(ws, {
          status: "suggested",
          created: "2026-01-02",
        });
        // Not in the queue.
        await seedProduct(ws, { status: "confirmed" });
        await seedProduct(ws, { status: "queued" });
        await seedProduct(other, { status: "suggested" });
        const order = [ask, rev, out, s1, s2].map((x) => x.classification);

        await as(user.viewer, async () => {
          expect(await position(null)).toEqual({
            id: order[0],
            prev_id: null,
            next_id: order[1],
            position: 1,
            total: 5,
          });
          expect(await position(order[2])).toEqual({
            id: order[2],
            prev_id: order[1],
            next_id: order[3],
            position: 3,
            total: 5,
          });
          expect(await position(order[4])).toMatchObject({
            next_id: null,
            position: 5,
          });
          // Gone from the queue (or never in it): back to the first item.
          expect((await position(randomUUID()))?.id).toBe(order[0]);
        });
        // Other workspaces see nothing of it.
        await as(user.outsider, async () => {
          expect(await position(null)).toBeNull();
        });
      }));
  });

  describe("hts_breadcrumb", () => {
    it("lists the heading, each parent line and the line itself", () =>
      scenario(async () => {
        const rev = await seedTariff();
        await as(user.viewer, async () => {
          const rows = (
            await db.query(
              "select code, indent, description from hts_breadcrumb($1, $2)",
              [rev, TEE_OTHER],
            )
          ).rows;
          expect(rows).toEqual([
            {
              code: "6109",
              indent: 0,
              description: "T-shirts, singlets, tank tops, knitted",
            },
            { code: "61091000", indent: 1, description: "Of cotton" },
            { code: "", indent: 2, description: "Men's or boys':" },
            { code: TEE_OTHER, indent: 3, description: "Other T-shirts" },
          ]);
          const none = await db.query(
            "select * from hts_breadcrumb($1, '0000000000')",
            [rev],
          );
          expect(none.rows).toEqual([]);
        });
      }));
  });

  describe("hardening (review round 1)", () => {
    const answer = (id: string, text: string) =>
      attempt("select answer_agent_question($1, $2)", [id, text]);

    it("refuses to confirm a code that changed in place after the page loaded", () =>
      scenario(async () => {
        await seedTariff();
        const { hash, classification } = await seedProduct(ws, {
          status: "suggested",
        });
        await db.query("update classifications set code = $2 where id = $1", [
          classification,
          TEE_OTHER,
        ]);
        await as(user.member, async () => {
          expect((await confirm(classification, hash, TEE))?.message).toBe(
            "stale",
          );
        });
      }));

    it("refuses an override when a colleague confirmed the code meanwhile", () =>
      scenario(async () => {
        await seedTariff();
        const { product, hash, classification } = await seedProduct(ws, {
          status: "suggested",
        });
        const shown = await seen(classification);
        await db.query(
          "update classifications set status = 'confirmed', confirmed_at = now() where id = $1",
          [classification],
        );
        await as(user.member, async () => {
          expect(
            (
              await override(
                product,
                classification,
                TEE_OTHER,
                "Printed logo",
                hash,
                shown,
              )
            )?.message,
          ).toBe("stale");
        });
      }));

    it("lets only owners and admins replace a broker-verified code", () =>
      scenario(async () => {
        await seedTariff();
        const { product, hash, classification } = await seedProduct(ws, {
          status: "broker_verified",
        });
        await as(user.member, async () => {
          expect(
            (
              await override(
                product,
                classification,
                TEE_OTHER,
                "Our own view",
                hash,
              )
            )?.message,
          ).toBe("broker_verified");
        });
        await as(user.admin, async () => {
          expect(
            await override(
              product,
              classification,
              TEE_OTHER,
              "Broker made a mistake",
              hash,
            ),
          ).toBeNull();
        });
      }));

    it("refuses every decision in a deleted workspace", () =>
      scenario(async () => {
        await seedTariff();
        const { product, hash, classification } = await seedProduct(ws, {
          status: "suggested",
        });
        const q = randomUUID();
        await db.query(
          `insert into agent_questions (id, workspace_id, product_id, question)
           values ($1, $2, $3, 'Knitted?')`,
          [q, ws, product],
        );
        await db.query(
          "update workspaces set deleted_at = now() where id = $1",
          [ws],
        );
        await as(user.member, async () => {
          expect((await confirm(classification, hash))?.code).toBe("42501");
          expect(
            (
              await override(
                product,
                classification,
                TEE_OTHER,
                "Reason here",
                hash,
              )
            )?.code,
          ).toBe("42501");
          expect((await answer(q, "Yes"))?.code).toBe("42501");
        });
      }));

    it("refuses unknown ids like other workspaces' ids", () =>
      scenario(async () => {
        await as(user.member, async () => {
          const id = randomUUID();
          expect((await confirm(id, "x", TEE))?.code).toBe("42501");
          expect(
            (await override(id, null, TEE, "Reason here", "x"))?.code,
          ).toBe("42501");
          expect((await answer(id, "Yes"))?.code).toBe("42501");
        });
      }));

    it("grants none of the review functions to anonymous callers", async () => {
      const fns = [
        "revision_in_force(public.market_code)",
        "is_filing_code(uuid, text)",
        "hts_breadcrumb(uuid, text)",
        "review_position(uuid, uuid, public.market_code)",
        "can_decide(uuid)",
        "confirm_classification(uuid, text, text)",
        "override_classification(uuid, uuid, text, public.class_status, text, text, text, public.market_code)",
        "answer_agent_question(uuid, text)",
      ];
      for (const fn of fns) {
        const { rows } = await db.query(
          `select has_function_privilege('anon', $1, 'execute') as anon,
                  has_function_privilege('authenticated', $1, 'execute') as signed_in`,
          [`public.${fn}`],
        );
        expect(rows[0], fn).toEqual({ anon: false, signed_in: true });
      }
    });

    it("answers only the current run's questions; older open ones never block the re-run", () =>
      scenario(async () => {
        const { product } = await seedProduct(ws);
        const [oldRun, newRun] = [randomUUID(), randomUUID()];
        for (const run of [oldRun, newRun])
          await db.query(
            `insert into agent_runs (id, workspace_id, product_id, model, prompt_version)
             values ($1, $2, $3, 'test', 'v1')`,
            [run, ws, product],
          );
        const cls = randomUUID();
        await db.query(
          `insert into classifications (id, workspace_id, product_id, status, agent_run_id)
           values ($1, $2, $3, 'needs_answer', $4)`,
          [cls, ws, product, newRun],
        );
        const [oldQ, newQ] = [randomUUID(), randomUUID()];
        await db.query(
          `insert into agent_questions (id, workspace_id, product_id, agent_run_id, question)
           values ($1, $3, $4, $5, 'Old question?'), ($2, $3, $4, $6, 'New question?')`,
          [oldQ, newQ, ws, product, oldRun, newRun],
        );
        await as(user.member, async () => {
          expect((await answer(oldQ, "Yes"))?.message).toBe("stale");
          expect(await answer(newQ, "Knitted")).toBeNull();
        });
        const status = await db.query(
          "select status from classifications where id = $1",
          [cls],
        );
        expect(status.rows[0].status).toBe("queued");
      }));

    it("an override in one market leaves other markets alone", () =>
      scenario(async () => {
        await seedTariff();
        const { product, hash } = await seedProduct(ws);
        const uk = randomUUID();
        await db.query(
          `insert into classifications (id, workspace_id, product_id, market, code, status)
           values ($1, $2, $3, 'UK', '6109100010', 'suggested')`,
          [uk, ws, product],
        );
        await as(user.member, async () => {
          expect(
            await override(product, null, TEE, "Checked by hand", hash),
          ).toBeNull();
        });
        const rows = await db.query(
          "select market, is_current from classifications where product_id = $1 order by market",
          [product],
        );
        expect(rows.rows).toEqual([
          { market: "US", is_current: true },
          { market: "UK", is_current: true },
        ]);
      }));

    it("follows parents across skipped indent levels", () =>
      scenario(async () => {
        const rev = randomUUID();
        await db.query(
          `insert into tariff_revisions (id, market, label, effective_from)
           values ($1, 'US', $2, current_date - 1)`,
          [rev, `gap-${rev}`],
        );
        const lines: [string, number, string, boolean][] = [
          ["0101", 0, "Live horses", false],
          ["", 1, "Horses:", false],
          ["0101210010", 2, "Purebred breeding horses", true],
          ["0102", 0, "Live bovine animals", false],
          ["0102290010", 2, "Cattle for slaughter", true],
        ];
        for (const [code, indent, description, leaf] of lines)
          await db.query(
            `insert into tariff_lines (revision_id, code, indent, description, is_leaf)
             values ($1, $2, $3, $4, $5)`,
            [rev, code, indent, description, leaf],
          );
        const rows = (
          await db.query(
            "select code, indent from hts_breadcrumb($1, '0102290010')",
            [rev],
          )
        ).rows;
        expect(rows).toEqual([
          { code: "0102", indent: 0 },
          { code: "0102290010", indent: 2 },
        ]);
      }));

    it("two people answering the last two questions at once still re-queue the code", async () => {
      // Real concurrency needs committed rows and two connections.
      const product = randomUUID();
      const cls = randomUUID();
      const [q1, q2] = [randomUUID(), randomUUID()];
      await db.query(
        "insert into products (id, workspace_id, sku, title) values ($1, $2, $3, 'Race')",
        [product, ws, `RACE-${product.slice(0, 8)}`],
      );
      await db.query(
        `insert into classifications (id, workspace_id, product_id, status)
         values ($1, $2, $3, 'needs_answer')`,
        [cls, ws, product],
      );
      await db.query(
        `insert into agent_questions (id, workspace_id, product_id, question)
         values ($1, $3, $4, 'One?'), ($2, $3, $4, 'Two?')`,
        [q1, q2, ws, product],
      );
      const [a, b]: PgClient[] = [await connect(), await connect()];
      try {
        for (const c of [a, b]) {
          await c.query("begin");
          await signInAs(c, user.member);
        }
        await a.query("select answer_agent_question($1, 'Yes')", [q1]);
        // b waits for a's product lock, then sees a's answer.
        const second = b.query("select answer_agent_question($1, 'No')", [q2]);
        await new Promise((r) => setTimeout(r, 200));
        await a.query("commit");
        await second;
        await b.query("commit");
      } finally {
        await a.end();
        await b.end();
      }
      const status = await db.query(
        "select status from classifications where id = $1",
        [cls],
      );
      expect(status.rows[0].status).toBe("queued");
    });
  });
});
