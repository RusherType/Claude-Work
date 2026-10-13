import { Client } from "pg";

// Direct access to the local Supabase database for e2e set-up that has no UI yet (making a user
// an admin, adding a confirmed code). CI only; refuses anything but a plain local URL.
export const e2eDatabaseUrl = process.env.E2E_DATABASE_URL;

export async function withLocalDb<T>(
  fn: (db: Client) => Promise<T>,
): Promise<T> {
  // Build the connection from checked parts: pg also reads ?host= from a URL, which could point
  // somewhere else than the hostname checked here.
  const url = new URL(e2eDatabaseUrl!);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.search !== ""
  ) {
    throw new Error("E2E_DATABASE_URL must be a plain local database URL");
  }
  const db = new Client({
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
  });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}
