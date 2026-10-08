import { Client } from "pg";
import { describe } from "vitest";

// Shared helpers for the live database suites. They only run against a LOCAL database
// (TEST_DATABASE_URL); see docs/06-schema.md ("Tests").

export const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
if (testDatabaseUrl && !LOCAL_HOSTS.has(new URL(testDatabaseUrl).hostname)) {
  throw new Error(
    "TEST_DATABASE_URL must point at a local database; these suites write test data.",
  );
}

/** describe() when a database is configured (or required in CI), otherwise describe.skip(). */
export const describeDb =
  testDatabaseUrl || process.env.REQUIRE_DB_TESTS ? describe : describe.skip;

export async function connect(): Promise<Client> {
  if (!testDatabaseUrl)
    throw new Error("REQUIRE_DB_TESTS is set but TEST_DATABASE_URL is missing");
  const db = new Client({ connectionString: testDatabaseUrl });
  await db.connect();
  return db;
}

/** Switch the current transaction to a signed-in user (or anon), as Supabase does per request. */
export async function signInAs(db: Client, uid: string | null) {
  await db.query(`set local role ${uid ? "authenticated" : "anon"}`);
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify(
      uid ? { sub: uid, role: "authenticated" } : { role: "anon" },
    ),
  ]);
}

/** Run `fn` as a user inside a transaction that is always rolled back. */
export async function asUser<T>(
  db: Client,
  uid: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  await db.query("begin");
  try {
    await signInAs(db, uid);
    return await fn();
  } finally {
    await db.query("rollback");
  }
}

export type DbError = { code?: string; message: string };

/** Runs one statement as `uid`; returns null on success or the Postgres error. */
export async function tryAs(
  db: Client,
  uid: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<DbError | null> {
  return asUser(db, uid, async () => {
    try {
      await db.query(sql, params);
      await db.query("set constraints all immediate");
      return null;
    } catch (e) {
      const err = e as DbError;
      return { code: err.code, message: err.message };
    }
  });
}
