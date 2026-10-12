import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { connect, describeDb, type DbError } from "./helpers";

// CD-014: platform admins edit tariff measures, fees and special programs only with a second
// factor (aal2); rows are drafts until published; published rows are permanent except for one
// end date; every change is audited. Run as real users against a live database.

const user = {
  admin: randomUUID(),
  member: randomUUID(),
};
const TAG = `admin-test-${randomUUID().slice(0, 8)}`;
let db: Client;

/** Supabase JWT claims: aal2 sessions carry the TOTP check time in `amr`. */
function claimsFor(uid: string, aal: "aal1" | "aal2" | "stale") {
  const now = Math.floor(Date.now() / 1000);
  if (aal === "aal1")
    return {
      sub: uid,
      role: "authenticated",
      aal,
      amr: [{ method: "otp", timestamp: now }],
    };
  const at = aal === "stale" ? now - 13 * 3600 : now - 60;
  return {
    sub: uid,
    role: "authenticated",
    aal: "aal2",
    amr: [{ method: "totp", timestamp: at }],
  };
}

/** Run statements as `uid` with the given assurance level in a transaction that is committed
 * (or rolled back on error). Returns the rows of the last statement or the error. */
async function as(
  uid: string | null,
  aal: "aal1" | "aal2" | "stale",
  statements: [string, unknown[]?][],
): Promise<{ rows: Record<string, unknown>[] } | { error: DbError }> {
  await db.query("begin");
  try {
    await db.query(`set local role ${uid ? "authenticated" : "anon"}`);
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(uid ? claimsFor(uid, aal) : { role: "anon" }),
    ]);
    let rows: Record<string, unknown>[] = [];
    for (const [sql, params] of statements)
      rows = (await db.query(sql, params)).rows;
    await db.query("commit");
    return { rows };
  } catch (e) {
    await db.query("rollback");
    const err = e as DbError;
    return { error: { code: err.code, message: err.message } };
  }
}
const ok = (r: Awaited<ReturnType<typeof as>>) => {
  if ("error" in r) throw new Error(`unexpected error: ${r.error.message}`);
  return r.rows;
};
const code = (r: Awaited<ReturnType<typeof as>>) =>
  "error" in r ? r.error.code : null;

const MEASURE = `insert into tariff_measures
  (market, authority, ch99_code, hts_prefixes, origin_countries, rate_type, rate_value,
   effective_from, source_url, notes)
  values ('US', 'Section 301', '9903.88.03', '{6109}', '{CN}', 'ad_valorem', 25,
   '2026-01-01', 'https://www.federalregister.gov/x', $1) returning id, published, published_at, rate_value`;
const FEE = `insert into fee_schedules (market, fee_type, pct, min_amount, max_amount,
   effective_from, source_url, notes)
  values ('US', 'mpf_formal', 0.3464, 32.71, 634.62, '2026-10-01', 'https://www.cbp.gov/x', $1)
  returning id, published`;
const PROGRAM = `insert into special_programs (symbol, name, countries, mpf_exempt,
   effective_from, source_url, notes)
  values ('S', 'USMCA', '{MX,CA}', true, '2020-07-01', 'https://hts.usitc.gov/gn', $1)
  returning id, published`;

/** Author columns, read as the database owner (signed-in users cannot select them). */
async function authors(id: string) {
  const { rows } = await db.query(
    "select created_by, published_by from tariff_measures where id = $1",
    [id],
  );
  return rows[0] as { created_by: string | null; published_by: string | null };
}

describeDb("admin editors (live database)", () => {
  beforeAll(async () => {
    db = await connect();
    await db.query("begin");
    for (const [name, uid] of Object.entries(user))
      await db.query(
        "insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())",
        [uid, `${name}-${TAG}@test.local`],
      );
    await db.query(
      "update profiles set is_platform_admin = true where id = $1",
      [user.admin],
    );
    await db.query("commit");
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await db.query("rollback").catch(() => {});
      // No signed-in user: maintenance may remove published rows.
      for (const t of ["tariff_measures", "fee_schedules", "special_programs"])
        await db.query(`delete from ${t} where notes = $1`, [TAG]);
      await db.query("delete from admin_mfa_attempts where user_id = any($1)", [
        Object.values(user),
      ]);
      await db.query("delete from reference_audit where actor_id = any($1)", [
        Object.values(user),
      ]);
      await db.query("delete from auth.users where id = any($1)", [
        Object.values(user),
      ]);
    } finally {
      await db.end();
    }
  });

  it("refuses writes without a second factor, and from non-admins", async () => {
    expect(code(await as(user.admin, "aal1", [[MEASURE, [TAG]]]))).toBe(
      "42501",
    );
    expect(code(await as(user.member, "aal2", [[MEASURE, [TAG]]]))).toBe(
      "42501",
    );
    expect(code(await as(user.member, "aal2", [[FEE, [TAG]]]))).toBe("42501");
    expect(code(await as(user.member, "aal2", [[PROGRAM, [TAG]]]))).toBe(
      "42501",
    );
    expect(code(await as(null, "aal1", [[MEASURE, [TAG]]]))).toBe("42501");
  });

  it("keeps drafts visible only to admins with a second factor, then publishes", async () => {
    const [draft] = ok(await as(user.admin, "aal2", [[MEASURE, [TAG]]]));
    expect(draft).toMatchObject({ published: false, published_at: null });
    expect(await authors(draft.id as string)).toEqual({
      created_by: user.admin,
      published_by: null,
    });

    const visible = async (uid: string, aal: "aal1" | "aal2") =>
      ok(
        await as(uid, aal, [
          ["select id from tariff_measures where id = $1", [draft.id]],
        ]),
      ).length;
    expect(await visible(user.member, "aal2")).toBe(0);
    expect(await visible(user.admin, "aal1")).toBe(0);
    expect(await visible(user.admin, "aal2")).toBe(1);

    // Drafts can be edited; a forged author or publish stamp is ignored.
    const [edited] = ok(
      await as(user.admin, "aal2", [
        [
          "update tariff_measures set rate_value = 7.5, created_by = $2, published_at = now() where id = $1 returning id, published, published_at, rate_value",
          [draft.id, user.member],
        ],
      ]),
    );
    expect(edited).toMatchObject({ rate_value: "7.5000", published_at: null });
    expect((await authors(draft.id as string)).created_by).toBe(user.admin);

    const [published] = ok(
      await as(user.admin, "aal2", [
        [
          "update tariff_measures set published = true where id = $1 returning id, published, published_at, rate_value",
          [draft.id],
        ],
      ]),
    );
    expect(published).toMatchObject({ published: true });
    expect((await authors(draft.id as string)).published_by).toBe(user.admin);
    expect(published.published_at).not.toBeNull();
    expect(await visible(user.member, "aal1")).toBe(1);
  });

  it("never edits, unpublishes or deletes a published row; it can be end-dated once", async () => {
    const [row] = ok(
      await as(user.admin, "aal2", [
        [MEASURE.replace("'Section 301'", "'Section 232'"), [TAG]],
        [
          "update tariff_measures set published = true where notes = $1 and authority = 'Section 232' returning id, published, published_at, rate_value",
          [TAG],
        ],
      ]),
    );
    const id = row.id;
    const attempt = (sql: string, params: unknown[] = [id]) =>
      as(user.admin, "aal2", [[sql, params]]);

    expect(
      code(
        await attempt(
          "update tariff_measures set rate_value = 50 where id = $1",
        ),
      ),
    ).toBe("42501");
    expect(
      code(
        await attempt(
          "update tariff_measures set published = false where id = $1",
        ),
      ),
    ).toBe("42501");
    expect(
      code(
        await attempt(
          "update tariff_measures set source_url = 'https://evil.test' where id = $1",
        ),
      ),
    ).toBe("42501");
    expect(
      code(await attempt("delete from tariff_measures where id = $1")),
    ).toBe("42501");
    expect(
      code(
        await attempt(
          "update tariff_measures set effective_to = '2025-12-31' where id = $1",
        ),
      ),
    ).toBe("23514");

    expect(
      code(
        await attempt(
          "update tariff_measures set effective_to = '2026-12-31' where id = $1",
        ),
      ),
    ).toBeNull();
    expect(
      code(
        await attempt(
          "update tariff_measures set effective_to = '2027-12-31' where id = $1",
        ),
      ),
    ).toBe("42501");
  });

  it("lets admins delete drafts", async () => {
    const [draft] = ok(await as(user.admin, "aal2", [[PROGRAM, [TAG]]]));
    ok(
      await as(user.admin, "aal2", [
        ["delete from special_programs where id = $1", [draft.id]],
      ]),
    );
    const left = await db.query(
      "select 1 from special_programs where id = $1",
      [draft.id],
    );
    expect(left.rowCount).toBe(0);
  });

  it("audits every change with the acting admin", async () => {
    const [fee] = ok(await as(user.admin, "aal2", [[FEE, [TAG]]]));
    ok(
      await as(user.admin, "aal2", [
        ["update fee_schedules set published = true where id = $1", [fee.id]],
      ]),
    );
    const { rows } = await db.query(
      "select action, actor_id, new_row ->> 'published' as published from reference_audit where row_id = $1 order by id",
      [fee.id],
    );
    expect(rows).toEqual([
      { action: "insert", actor_id: user.admin, published: "false" },
      { action: "update", actor_id: user.admin, published: "true" },
    ]);
    const read = async (uid: string, aal: "aal1" | "aal2") =>
      ok(
        await as(uid, aal, [
          ["select 1 from reference_audit where row_id = $1", [fee.id]],
        ]),
      ).length;
    expect(await read(user.member, "aal2")).toBe(0);
    expect(await read(user.admin, "aal1")).toBe(0);
    expect(await read(user.admin, "aal2")).toBe(2);
    expect(
      code(
        await as(user.admin, "aal2", [
          ["delete from reference_audit where row_id = $1", [fee.id]],
        ]),
      ),
    ).toBe("42501");
  });

  it("rejects rows the landed-cost engine would refuse", async () => {
    const bad = async (sql: string) =>
      code(await as(user.admin, "aal2", [[sql, [TAG]]]));
    const measure = (from: string, to: string) =>
      bad(MEASURE.replace(from, to));
    expect(await measure("'{6109}'", "'{6109.10}'")).toBe("23514");
    expect(await measure("'{6109}'", "'{}'")).toBe("23514");
    expect(await measure("'{CN}'", "'{China}'")).toBe("22001");
    expect(await measure("'{CN}'", "'{cn}'")).toBe("23514");
    expect(await measure("'9903.88.03'", "'990388'")).toBe("23514");
    expect(
      await measure("'https://www.federalregister.gov/x'", "'http://x.test'"),
    ).toBe("23514");
    expect(
      await measure("'2026-01-01', 'https", "'2026-01-01', 'https"),
    ).toBeNull();
    expect(
      await bad(
        MEASURE.replace("notes)", "notes, applies_to_modes)").replace(
          "$1)",
          "$1, '{air,rail}')",
        ),
      ),
    ).toBe("23514");
    expect(
      await bad(
        MEASURE.replace("notes)", "notes, exempt_programs)").replace(
          "$1)",
          "$1, '{usmca}')",
        ),
      ),
    ).toBe("23514");

    const fee = (from: string, to: string) => bad(FEE.replace(from, to));
    expect(await fee("'mpf_formal'", "'mpf'")).toBe("23514");
    expect(
      await fee("'mpf_formal', 0.3464", "'informal_entry_limit', 0.3464"),
    ).toBe("23514");
    expect(await fee("0.3464, 32.71, 634.62", "null, 32.71, 634.62")).toBe(
      "23514",
    );
    expect(await fee("32.71, 634.62", "700, 634.62")).toBe("23514");
    expect(await fee("'https://www.cbp.gov/x'", "'cbp.gov'")).toBe("23514");

    const program = (from: string, to: string) =>
      bad(PROGRAM.replace(from, to));
    expect(await program("'S'", "'usmca'")).toBe("23514");
    expect(await program("'{MX,CA}'", "'{}'")).toBe("23514");
  });

  it("checks the second factor through is_platform_admin_mfa", async () => {
    const check = async (uid: string, aal: "aal1" | "aal2") =>
      ok(await as(uid, aal, [["select is_platform_admin_mfa() as ok", []]]))[0]
        .ok;
    expect(await check(user.admin, "aal2")).toBe(true);
    expect(await check(user.admin, "aal1")).toBe(false);
    expect(await check(user.member, "aal2")).toBe(false);
  });

  it("needs a recent TOTP check, not just an aal2 session", async () => {
    const check = async (aal: "aal2" | "stale") =>
      ok(
        await as(user.admin, aal, [
          ["select is_platform_admin_mfa() as ok", []],
        ]),
      )[0].ok;
    expect(await check("aal2")).toBe(true);
    expect(await check("stale")).toBe(false);
    expect(code(await as(user.admin, "stale", [[MEASURE, [TAG]]]))).toBe(
      "42501",
    );
  });

  it("hides who wrote a row from other users", async () => {
    const err = await as(user.member, "aal1", [
      ["select created_by from tariff_measures limit 1", []],
    ]);
    expect(code(err)).toBe("42501");
    const err2 = await as(user.member, "aal1", [
      ["select * from fee_schedules limit 1", []],
    ]);
    expect(code(err2)).toBe("42501");
  });

  it("counts wrong second-factor codes per admin, recorded only through the function", async () => {
    const failures = async (uid: string) =>
      ok(await as(uid, "aal1", [["select mfa_failures_recent() as n", []]]))[0]
        .n;
    expect(await failures(user.admin)).toBe(0);
    for (let i = 0; i < 3; i++) {
      ok(
        await as(user.admin, "aal1", [
          ["select record_mfa_event('verify_failed')", []],
        ]),
      );
    }
    ok(
      await as(user.admin, "aal1", [
        ["select record_mfa_event('verify_ok')", []],
      ]),
    );
    expect(await failures(user.admin)).toBe(3);
    expect(await failures(user.member)).toBe(0);
    // Not an admin, a bad kind, or a direct write: refused.
    expect(
      code(
        await as(user.member, "aal1", [
          ["select record_mfa_event('verify_failed')", []],
        ]),
      ),
    ).toBe("42501");
    expect(
      code(
        await as(user.admin, "aal1", [
          ["select record_mfa_event('reset')", []],
        ]),
      ),
    ).toBe("23514");
    expect(
      code(
        await as(user.admin, "aal1", [
          ["delete from admin_mfa_attempts where user_id = auth.uid()", []],
        ]),
      ),
    ).toBe("42501");
    expect(
      code(await as(null, "aal1", [["select mfa_failures_recent()", []]])),
    ).toBe("42501");
  });
});
