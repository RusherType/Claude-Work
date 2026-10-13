/**
 * CD-023: catalog filters from the URL, and how they become a query on the catalog_items view.
 * Pure functions, shared by the page and its tests.
 */
import { z } from "zod";
import { isCountryCode } from "@/lib/countries";

export const PAGE_SIZE = 50;

export const STATUSES = [
  "unclassified",
  "queued",
  "needs_answer",
  "in_review",
  "suggested",
  "confirmed",
  "broker_verified",
  "outdated",
] as const;
export type CatalogStatus = (typeof STATUSES)[number];

/** Plain words for every status (docs/04-frontend.md StatusChip). Never "guaranteed". */
export const STATUS_LABELS: Record<CatalogStatus, string> = {
  unclassified: "Not classified",
  queued: "Queued",
  needs_answer: "Needs answer",
  in_review: "In review",
  suggested: "Suggested",
  confirmed: "Confirmed",
  broker_verified: "Broker verified",
  outdated: "Outdated",
};

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => {
    const s = one(v);
    return typeof s === "string" && s.trim() !== "" ? s.trim() : undefined;
  }, schema.optional().catch(undefined));

/** Anything odd in the URL is dropped rather than shown as an error. */
export const listingSchema = z.object({
  q: optional(z.string().max(100)),
  status: optional(z.enum(STATUSES)),
  origin: optional(
    z
      .string()
      .transform((s) => s.toUpperCase())
      .refine(isCountryCode),
  ),
  chapter: optional(z.string().regex(/^\d{2}$/)),
  page: z.preprocess(
    (v) => Number(one(v) ?? 1),
    z.number().int().min(1).max(10_000).catch(1),
  ),
});
export type Listing = z.infer<typeof listingSchema>;

export function parseListing(
  searchParams: Record<string, string | string[] | undefined>,
): Listing {
  return listingSchema.parse(searchParams);
}

/**
 * Search text made safe for a PostgREST `or=(...)` filter: only the characters that structure the
 * filter (commas, parentheses, double quotes, backslash) and its `*` wildcard are removed. LIKE
 * wildcards (`%`, `_`) stay: at worst they match a little more.
 */
export function searchTerm(q: string): string {
  return q
    .replace(/[,()"\\*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The PostgREST `or` filter for a search: title or SKU contains it, or the code starts with it. */
export function searchFilter(q: string): string | null {
  const term = searchTerm(q);
  if (!term) return null;
  const parts = [`title.ilike.*${term}*`, `sku.ilike.*${term}*`];
  const digits = term.replace(/[.\s]/g, "");
  if (/^\d{2,10}$/.test(digits)) parts.push(`code.like.${digits}*`);
  return parts.join(",");
}

/** Query string for a link that keeps the current filters, with some changed. */
export function listingHref(
  current: Listing,
  change: Partial<Listing>,
): string {
  const next = { ...current, ...change };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status) params.set("status", next.status);
  if (next.origin) params.set("origin", next.origin);
  if (next.chapter) params.set("chapter", next.chapter);
  if (next.page && next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `/app/catalog?${qs}` : "/app/catalog";
}

/** "6109100012" -> "6109.10.0012" (docs/04-frontend.md). */
export function formatHtsCode(code: string): string {
  return /^\d{10}$/.test(code)
    ? `${code.slice(0, 4)}.${code.slice(4, 6)}.${code.slice(6)}`
    : code;
}

export const pageCount = (total: number) =>
  Math.max(1, Math.ceil(total / PAGE_SIZE));

/** The page to show instead, when `page` is past the last one (stale or hand-edited links). */
export function pageOverflow(page: number, total: number): number | null {
  return page > pageCount(total) ? pageCount(total) : null;
}
