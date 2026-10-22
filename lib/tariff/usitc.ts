/**
 * USITC HTS REST API (https://hts.usitc.gov/reststop). Public, no key. Requests are made
 * one chapter at a time with retries, to stay polite.
 */
import { z } from "zod";
import { usitcRowSchema, type UsitcRow } from "./hts-import";

const BASE = "https://hts.usitc.gov/reststop";

export interface Release {
  name: string; // "2026HTSRev21"
  title: string; // "Revision 21 (2026)"
  effectiveFrom: string; // ISO date
  sourceUrl: string;
}

async function getJson(url: string, attempts = 3): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`USITC ${res.status} for ${url}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts)
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastError;
}

/** "10/09/2026" → "2026-10-09" */
export function usDateToIso(us: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(us.trim());
  if (!match) throw new Error(`Unexpected USITC date "${us}"`);
  return `${match[3]}-${match[1]}-${match[2]}`;
}

const currentSchema = z.object({ name: z.string().min(1), title: z.string() });
const listSchema = z.array(
  z
    .object({ name: z.string(), releaseStartDate: z.string().nullish() })
    .loose(),
);

export async function fetchCurrentRelease(): Promise<Release> {
  const current = currentSchema.parse(await getJson(`${BASE}/currentRelease`));
  const list = listSchema.parse(await getJson(`${BASE}/releaseList`));
  const start = list.find((r) => r.name === current.name)?.releaseStartDate;
  if (!start) throw new Error(`No start date for release ${current.name}`);
  return {
    name: current.name,
    title: current.title,
    effectiveFrom: usDateToIso(start),
    sourceUrl: `https://hts.usitc.gov/?release=${encodeURIComponent(current.name)}`,
  };
}

export async function fetchChapter(chapter: string): Promise<UsitcRow[]> {
  const url = `${BASE}/exportList?format=JSON&from=${chapter}00&to=${chapter}99&styles=false`;
  return z.array(usitcRowSchema).parse(await getJson(url));
}
