import "server-only";
import { headers } from "next/headers";

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * The app's public origin for links in emails and auth redirects. NEXT_PUBLIC_SITE_URL
 * must be set in every deployed environment. Only on localhost does it fall back to the
 * request's own host (so the dev server works on any port); trusting the Host header
 * anywhere else would let a forged header put another domain into invite links.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = (await headers()).get("host") ?? "";
  if (LOCAL_HOST.test(host)) return `http://${host}`;
  throw new Error("NEXT_PUBLIC_SITE_URL is not set");
}
