import { createHash, randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, describeDb, signInAs, tryAs } from "./helpers";

// CD-004: create_workspace, create_invitation, accept_invitation, revoke_invitation and
// workspace_members, run as real signed-in users against a live database.

const ws = randomUUID();
const user = {
  owner: randomUUID(),
  admin: randomUUID(),
  member: randomUUID(),
  viewer: randomUUID(),
  invitee: randomUUID(),
  stranger: randomUUID(),
  unconfirmed: randomUUID(),
};
const email = (name: string) => `${name}-${ws.slice(0, 8)}@test.local`;

let db: Client;

// Run several statements as one user in one rolled-back transaction.
async function run<T>(
  uid: string | null,
  fn: (q: Client["query"]) => Promise<T>,
) {
  return asUser(db, uid, () => fn(db.query.bind(db)));
}

async function invite(
  byUid: string,
  address: string,
  role = "member",
): Promise<string> {
  await db.query("begin");
  try {
    await signInAs(db, byUid);
    const { rows } = await db.query(
      "select create_invitation($1, $2, $3) as token",
      [ws, address, role],
    );
    await db.query("commit");
    return rows[0].token;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

describeDb("workspace functions (live database)", () => {
  beforeAll(async () => {
    db = await connect();
    await db.query("begin");
    for (const [name, uid] of Object.entries(user))
      await db.query(
        "insert into auth.users (id, email, email_confirmed_at) values ($1, $2, $3)",
        [uid, email(name), name === "unconfirmed" ? null : new Date()],
      );
    await db.query(
      "insert into workspaces (id, name, home_country) values ($1, 'W', 'IN')",
      [ws],
    );
    await db.query(
      `insert into memberships (workspace_id, user_id, role) values
        ($1, $2, 'owner'), ($1, $3, 'admin'), ($1, $4, 'member'), ($1, $5, 'viewer')`,
      [ws, user.owner, user.admin, user.member, user.viewer],
    );
    await db.query("commit");
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await db.query("rollback").catch(() => {});
      await db.query(
        `delete from workspaces where id in (
           select workspace_id from memberships where user_id = any($1))`,
        [Object.values(user)],
      );
      await db.query("delete from auth.users where id = any($1)", [
        Object.values(user),
      ]);
    } finally {
      await db.end();
    }
  });

  // ---------- create_workspace ----------
  it("creates a workspace with the caller as its only owner, and audits it", async () => {
    const result = await run(user.stranger, async (q) => {
      const { rows } = await q(
        "select create_workspace('Acme', 'GB', 'importer') as id",
      );
      const id = rows[0].id as string;
      const members = (
        await q(
          "select user_id::text, role from memberships where workspace_id = $1",
          [id],
        )
      ).rows;
      const visible = (
        await q("select name from workspaces where id = $1", [id])
      ).rows;
      await q("reset role");
      const audit = (
        await q(
          "select actor_id::text, action from audit_log where workspace_id = $1",
          [id],
        )
      ).rows;
      return { members, visible, audit };
    });
    expect(result.members).toEqual([{ user_id: user.stranger, role: "owner" }]);
    expect(result.visible).toEqual([{ name: "Acme" }]);
    expect(result.audit).toContainEqual({
      actor_id: user.stranger,
      action: "workspace.create",
    });
  });

  it.each([
    ["an empty name", "''", "'GB'", "null", "invalid_name"],
    [
      "a 121-character name",
      `'${"x".repeat(121)}'`,
      "'GB'",
      "null",
      "invalid_name",
    ],
    ["a lowercase country", "'Acme'", "'gb'", "null", "invalid_country"],
    [
      "an unknown business type",
      "'Acme'",
      "'GB'",
      "'reseller'",
      "invalid_business_type",
    ],
  ])("rejects %s", async (_name, name, country, type, message) => {
    const err = await tryAs(
      db,
      user.stranger,
      `select create_workspace(${name}, ${country}, ${type})`,
    );
    expect(err).toMatchObject({ code: "22023", message });
  });

  it("caps the number of workspaces one user can own", async () => {
    const err = await run(user.stranger, async (q) => {
      for (let i = 0; i < 20; i++)
        await q("select create_workspace($1, 'US')", [`W${i}`]);
      try {
        await q("select create_workspace('one too many', 'US')");
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(err).toBe("too_many_workspaces");
  });

  it("cannot be called by anon", async () => {
    expect(
      await tryAs(db, null, "select create_workspace('x', 'US')"),
    ).toMatchObject({
      code: "42501",
    });
  });

  // ---------- create_invitation ----------
  it.each([
    ["member", user.member],
    ["viewer", user.viewer],
    ["stranger", user.stranger],
  ])("a %s cannot invite", async (_role, uid) => {
    const err = await tryAs(
      db,
      uid,
      "select create_invitation($1, $2, 'member')",
      [ws, email("new")],
    );
    expect(err).toMatchObject({ code: "42501" });
  });

  it("an admin can invite a member but not an owner; an owner can invite an owner", async () => {
    const sql = "select create_invitation($1, $2, $3)";
    expect(
      await tryAs(db, user.admin, sql, [ws, email("new"), "member"]),
    ).toBeNull();
    expect(
      await tryAs(db, user.admin, sql, [ws, email("new"), "owner"]),
    ).toMatchObject({
      code: "42501",
      message: "only_owners_invite_owners",
    });
    expect(
      await tryAs(db, user.owner, sql, [ws, email("new"), "owner"]),
    ).toBeNull();
  });

  it("stores only a hash of the token, normalises the email, and hides the hash from clients", async () => {
    const token = await invite(
      user.admin,
      `  ${email("hashcheck").toUpperCase()} `,
    );
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const { rows } = await db.query(
      "select email, token_hash from invitations where email = $1",
      [email("hashcheck")],
    );
    expect(rows).toEqual([
      {
        email: email("hashcheck"),
        token_hash: createHash("sha256").update(token).digest("hex"),
      },
    ]);
    expect(
      await tryAs(db, user.owner, "select token_hash from invitations"),
    ).toMatchObject({
      code: "42501",
    });
    const visible = await run(
      user.admin,
      async (q) =>
        (
          await q("select email from invitations where email = $1", [
            email("hashcheck"),
          ])
        ).rows,
    );
    expect(visible).toEqual([{ email: email("hashcheck") }]);
  });

  it.each([
    ["an invalid address", "not-an-email", "invalid_email"],
    ["an existing member", "MEMBER", "already_member"],
  ])("rejects %s", async (_name, address, message) => {
    const to = address === "MEMBER" ? email("member") : address;
    const err = await tryAs(
      db,
      user.owner,
      "select create_invitation($1, $2, 'member')",
      [ws, to],
    );
    expect(err).toMatchObject({ code: "22023", message });
  });

  it("a new invitation replaces the open one for the same address", async () => {
    const first = await invite(user.owner, email("twice"));
    await invite(user.owner, email("twice"));
    const err = await tryAs(db, user.stranger, "select accept_invitation($1)", [
      first,
    ]);
    expect(err?.message).toBe("invitation_invalid");
  });

  it("an admin cannot revoke or replace an owner's invitation; an owner can", async () => {
    await invite(user.owner, email("future-owner"), "owner");
    const { rows } = await db.query(
      "select id from invitations where email = $1 and revoked_at is null",
      [email("future-owner")],
    );
    const id = rows[0].id;
    expect(
      await tryAs(db, user.admin, "select revoke_invitation($1)", [id]),
    ).toMatchObject({
      code: "42501",
    });
    expect(
      await tryAs(
        db,
        user.admin,
        "select create_invitation($1, $2, 'member')",
        [ws, email("future-owner")],
      ),
    ).toMatchObject({ code: "42501", message: "only_owners_invite_owners" });
    expect(
      await tryAs(db, user.owner, "select revoke_invitation($1)", [id]),
    ).toBeNull();
  });

  it("an expired owner invitation does not block an admin from inviting that address", async () => {
    await invite(user.owner, email("lapsed-owner"), "owner");
    await db.query(
      "update invitations set expires_at = now() - interval '1 minute' where email = $1",
      [email("lapsed-owner")],
    );
    expect(
      await tryAs(
        db,
        user.admin,
        "select create_invitation($1, $2, 'member')",
        [ws, email("lapsed-owner")],
      ),
    ).toBeNull();
  });

  it("does not count expired invitations toward the open-invitation cap", async () => {
    const err = await run(user.admin, async (q) => {
      await q("reset role");
      await q(
        `insert into invitations (workspace_id, email, role, token_hash, expires_at)
         select $1::uuid, 'cap-' || g || '@test.local', 'member', 'cap-' || g || '-' || $1::text, now() - interval '1 day'
         from generate_series(1, 200) g`,
        [ws],
      );
      await signInAs(db, user.admin);
      try {
        await q("select create_invitation($1, $2, 'member')", [
          ws,
          email("after-cap"),
        ]);
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(err).toBeNull();
  });

  it("audits a revocation only when it changed something", async () => {
    const count = await run(user.owner, async (q) => {
      await q("select create_invitation($1, $2, 'member')", [
        ws,
        email("revoke-twice"),
      ]);
      const { rows } = await q("select id from invitations where email = $1", [
        email("revoke-twice"),
      ]);
      await q("select revoke_invitation($1)", [rows[0].id]);
      await q("select revoke_invitation($1)", [rows[0].id]);
      await q("reset role");
      return (
        await q(
          "select count(*)::int as n from audit_log where action = 'invitation.revoke' and entity_id = $1",
          [rows[0].id],
        )
      ).rows[0].n;
    });
    expect(count).toBe(1);
  });

  // ---------- accept_invitation ----------
  it("the invited address can accept once and gets the invited role", async () => {
    const token = await invite(user.admin, email("invitee"), "viewer");
    const result = await run(user.invitee, async (q) => {
      const { rows } = await q("select accept_invitation($1)::text as ws", [
        token,
      ]);
      const mine = (
        await q(
          "select role from memberships where workspace_id = $1 and user_id = $2",
          [ws, user.invitee],
        )
      ).rows;
      let again: string | null = null;
      try {
        await q("savepoint s");
        await q("select accept_invitation($1)", [token]);
      } catch (e) {
        again = (e as Error).message;
        await q("rollback to savepoint s");
      }
      return { joined: rows[0].ws, mine, again };
    });
    expect(result).toEqual({
      joined: ws,
      mine: [{ role: "viewer" }],
      again: "invitation_invalid",
    });
  });

  it.each([
    ["a different signed-in address", "stranger", "invitation_wrong_email"],
    ["an unconfirmed address", "unconfirmed", "invitation_wrong_email"],
  ])("rejects %s", async (_name, who, message) => {
    const token = await invite(user.owner, email(who));
    const actor = who === "stranger" ? user.invitee : user.unconfirmed;
    const err = await tryAs(db, actor, "select accept_invitation($1)", [token]);
    expect(err?.message).toBe(message);
  });

  it("rejects expired, revoked and made-up tokens", async () => {
    const expired = await invite(user.owner, email("expired"));
    await db.query(
      "update invitations set expires_at = now() - interval '1 minute' where email = $1",
      [email("expired")],
    );
    const revoked = await invite(user.owner, email("revoked"));
    const { rows } = await db.query(
      "select id from invitations where email = $1 and revoked_at is null",
      [email("revoked")],
    );
    expect(
      await tryAs(db, user.member, "select revoke_invitation($1)", [
        rows[0].id,
      ]),
    ).toMatchObject({
      code: "42501",
    });
    await db.query("begin");
    await signInAs(db, user.admin);
    await db.query("select revoke_invitation($1)", [rows[0].id]);
    await db.query("commit");

    await db.query("update auth.users set email = $1 where id = $2", [
      email("expired"),
      user.stranger,
    ]);
    try {
      expect(
        (
          await tryAs(db, user.stranger, "select accept_invitation($1)", [
            expired,
          ])
        )?.message,
      ).toBe("invitation_expired");
    } finally {
      await db.query("update auth.users set email = $1 where id = $2", [
        email("stranger"),
        user.stranger,
      ]);
    }
    for (const token of [revoked, "0".repeat(64), ""]) {
      expect(
        (
          await tryAs(db, user.stranger, "select accept_invitation($1)", [
            token,
          ])
        )?.message,
      ).toBe("invitation_invalid");
    }
  });

  it("accepting while already a member keeps the existing role", async () => {
    const token = await invite(user.owner, email("member2"), "admin");
    await db.query("update invitations set email = $1 where token_hash = $2", [
      email("member"),
      createHash("sha256").update(token).digest("hex"),
    ]);
    const role = await run(user.member, async (q) => {
      await q("select accept_invitation($1)", [token]);
      return (
        await q(
          "select role from memberships where workspace_id = $1 and user_id = $2",
          [ws, user.member],
        )
      ).rows[0].role;
    });
    expect(role).toBe("member");
  });

  // ---------- workspace_members ----------
  it("lists members with emails for members only", async () => {
    const list = await run(
      user.viewer,
      async (q) =>
        (
          await q(
            "select user_id::text, email, role from workspace_members($1)",
            [ws],
          )
        ).rows,
    );
    expect(list).toEqual(
      expect.arrayContaining([
        { user_id: user.owner, email: email("owner"), role: "owner" },
        { user_id: user.viewer, email: email("viewer"), role: "viewer" },
      ]),
    );
    expect(
      await tryAs(db, user.stranger, "select * from workspace_members($1)", [
        ws,
      ]),
    ).toMatchObject({
      code: "42501",
    });
    expect(
      await tryAs(db, null, "select * from workspace_members($1)", [ws]),
    ).toMatchObject({
      code: "42501",
    });
  });

  // ---------- Hardening from the security audit ----------
  it("every SECURITY DEFINER function pins an empty search_path", async () => {
    const { rows } = await db.query(
      `select proname from pg_proc
       where pronamespace = 'public'::regnamespace and prosecdef
         and not coalesce('search_path=""' = any(proconfig), false)
       order by 1`,
    );
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it("invitations sent by someone who was removed or demoted no longer work", async () => {
    const tryAccept = async (inviter: string, role: string, undo: string) => {
      await db.query("begin");
      try {
        await signInAs(db, inviter);
        const { rows } = await db.query(
          "select create_invitation($1, $2, $3) as t",
          [ws, email("stranger"), role],
        );
        await db.query("reset role");
        await db.query(undo, [ws, inviter]);
        await signInAs(db, user.stranger);
        await db.query("savepoint s");
        try {
          await db.query("select accept_invitation($1)", [rows[0].t]);
          return null;
        } catch (e) {
          await db.query("rollback to savepoint s");
          return (e as Error).message;
        }
      } finally {
        await db.query("rollback");
      }
    };
    const removed =
      "delete from memberships where workspace_id = $1 and user_id = $2";
    expect(await tryAccept(user.admin, "admin", removed)).toBe(
      "invitation_invalid",
    );
    const demoted =
      "update memberships set role = 'admin' where workspace_id = $1 and user_id = $2";
    // Keep another owner so the demotion itself is allowed.
    await db.query("begin");
    try {
      await signInAs(db, user.owner);
      const { rows } = await db.query(
        "select create_invitation($1, $2, 'owner') as t",
        [ws, email("stranger")],
      );
      await db.query("reset role");
      await db.query(
        "update memberships set role = 'owner' where workspace_id = $1 and user_id = $2",
        [ws, user.admin],
      );
      await db.query(demoted, [ws, user.owner]);
      await signInAs(db, user.stranger);
      await expect(
        db.query("select accept_invitation($1)", [rows[0].t]),
      ).rejects.toThrow("invitation_invalid");
    } finally {
      await db.query("rollback");
    }
  });

  it("deleted workspaces take no new invitations", async () => {
    const err = await run(user.owner, async (q) => {
      await q("reset role");
      await q("update workspaces set deleted_at = now() where id = $1", [ws]);
      await signInAs(db, user.owner);
      try {
        await q("select create_invitation($1, $2, 'member')", [
          ws,
          email("late"),
        ]);
        return null;
      } catch (e) {
        return (e as { code?: string }).code;
      }
    });
    expect(err).toBe("42501");
  });

  it("invitation audit rows do not reveal the invitee's email", async () => {
    const data = await run(user.owner, async (q) => {
      await q("select create_invitation($1, $2, 'member')", [
        ws,
        email("private"),
      ]);
      await q("reset role");
      return (
        await q(
          "select data from audit_log where workspace_id = $1 and action = 'invitation.create' order by id desc limit 1",
          [ws],
        )
      ).rows[0].data;
    });
    expect(data).toEqual({ role: "member" });
  });

  describe("product edits and deletes by members", () => {
    const product = randomUUID();
    const fixture = async (status: string, broker = false) => {
      await db.query("reset role");
      await db.query(
        "insert into products (id, workspace_id, title, content_hash) values ($1, $2, 'Tee', 'h1')",
        [product, ws],
      );
      await db.query(
        "insert into classifications (workspace_id, product_id, status, is_current) values ($1, $2, $3, true)",
        [ws, product, status],
      );
      if (broker)
        await db.query(
          "insert into broker_orders (workspace_id, product_id) values ($1, $2)",
          [ws, product],
        );
      await signInAs(db, user.member);
    };

    it("a content change marks the confirmed code outdated", async () => {
      const status = await run(user.member, async (q) => {
        await fixture("confirmed");
        await q("update products set content_hash = 'h2' where id = $1", [
          product,
        ]);
        await q("reset role");
        return (
          await q("select status from classifications where product_id = $1", [
            product,
          ])
        ).rows[0].status;
      });
      expect(status).toBe("outdated");
    });

    it.each([
      ["a confirmed code", "confirmed", false],
      ["a broker order", "suggested", true],
    ])(
      "a product with %s cannot be deleted by a client",
      async (_n, status, broker) => {
        const code = await run(user.member, async (q) => {
          await fixture(status, broker);
          try {
            await q("delete from products where id = $1", [product]);
            return null;
          } catch (e) {
            return (e as Error).message;
          }
        });
        expect(code).toBe("product_has_records");
      },
    );

    it("a product with only suggestions can be deleted", async () => {
      const deleted = await run(user.member, async (q) => {
        await fixture("suggested");
        return (await q("delete from products where id = $1", [product]))
          .rowCount;
      });
      expect(deleted).toBe(1);
    });
  });

  it("trigger functions cannot be called directly", async () => {
    expect(
      await tryAs(db, user.owner, "select handle_new_user()"),
    ).toMatchObject({ code: "42501" });
  });
});
