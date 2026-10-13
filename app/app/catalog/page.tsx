import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { COUNTRIES } from "@/lib/countries";
import {
  listingHref,
  PAGE_SIZE,
  pageCount,
  pageOverflow,
  parseListing,
  searchFilter,
  STATUS_LABELS,
  STATUSES,
  type CatalogStatus,
} from "@/lib/catalog/listing";
import { createClient } from "@/lib/supabase/server";
import { field, primary, secondary } from "@/lib/ui/styles";
import { getWorkspaceContext } from "@/lib/workspace";
import { CatalogTable, type CatalogRow } from "./catalog-table";

export const metadata: Metadata = { title: "Catalog · ClearDuty" };

const COUNTRY_NAMES = new Map(COUNTRIES.map((c) => [c.code, c.name]));

export default async function CatalogPage(props: PageProps<"/app/catalog">) {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/sign-in?next=/app/catalog");
  if (!ctx.workspace) redirect("/app");
  const { workspace } = ctx;
  const listing = parseListing(await props.searchParams);
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");

  let query = supabase
    .from("catalog_items")
    .select(
      "id, title, sku, origin_country, image_url, code, status, confidence, checked_at",
      { count: "exact" },
    )
    .eq("workspace_id", workspace.id);
  if (listing.status === "unclassified") query = query.is("status", null);
  else if (listing.status) query = query.eq("status", listing.status);
  if (listing.origin) query = query.eq("origin_country", listing.origin);
  if (listing.chapter) query = query.eq("chapter", listing.chapter);
  const search = listing.q ? searchFilter(listing.q) : null;
  if (search) query = query.or(search);
  const from = (listing.page - 1) * PAGE_SIZE;

  // Errors surface through app/app/error.tsx (plain message + retry).
  const [rows, facets] = await Promise.all([
    query
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE_SIZE - 1),
    supabase.rpc("catalog_facets", { p_workspace_id: workspace.id }),
  ]);
  // A page past the end (stale or hand-edited link): PostgREST answers 416 (PGRST103) without a
  // count, so go to page 1; when the offset only reaches the end, go to the last page.
  if (rows.error?.code === "PGRST103")
    redirect(listingHref(listing, { page: 1 }));
  if (rows.error || facets.error) throw new Error("Could not load the catalog");
  const overflow = pageOverflow(listing.page, rows.count ?? 0);
  if (overflow !== null) redirect(listingHref(listing, { page: overflow }));

  const total = rows.count ?? 0;
  const counts = (facet: string) =>
    facets.data
      .filter((f) => f.facet === facet)
      .map((f) => [f.value, Number(f.products)] as const);
  const totalProducts = counts("status").reduce((n, [, c]) => n + c, 0);
  const filtered = Boolean(
    listing.q || listing.status || listing.origin || listing.chapter,
  );
  const pages = pageCount(total);

  if (totalProducts === 0) {
    return (
      <section className="border-border bg-surface flex flex-col items-start gap-3 rounded-lg border p-6">
        <h1 className="text-xl font-semibold">Catalog</h1>
        <p className="text-muted text-sm">
          No products yet. Import them from a CSV file to see their tariff codes
          and landed cost here.
        </p>
        <Link href="/app/catalog/import" className={primary}>
          Import products
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Catalog</h1>
          <p className="text-muted mt-1 text-sm">
            {totalProducts.toLocaleString()} products in {workspace.name}.
          </p>
        </div>
        <Link href="/app/catalog/import" className={secondary}>
          Import products
        </Link>
      </div>

      {/* Keyed by the filters: a link (e.g. Clear filters) keeps this form mounted, and inputs only
          take their defaultValue on mount, so remount it whenever the filters change. */}
      <form
        key={listingHref(listing, { page: 1 })}
        method="get"
        className="flex flex-wrap items-end gap-3"
        role="search"
      >
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <label htmlFor="catalog-q" className="text-sm font-medium">
            Search
          </label>
          <input
            id="catalog-q"
            name="q"
            type="search"
            defaultValue={listing.q}
            placeholder="Product, SKU or HTS code"
            className={field}
          />
        </div>
        <FilterSelect
          id="catalog-status"
          label="Status"
          name="status"
          value={listing.status}
          options={STATUSES.map((s) => [
            s,
            STATUS_LABELS[s],
            countOf(counts("status"), s),
          ])}
        />
        <FilterSelect
          id="catalog-origin"
          label="Origin"
          name="origin"
          value={listing.origin}
          fallbackLabel={
            listing.origin &&
            (COUNTRY_NAMES.get(listing.origin) ?? listing.origin)
          }
          options={counts("origin").map(([code, n]) => [
            code,
            COUNTRY_NAMES.get(code) ?? code,
            n,
          ])}
        />
        <FilterSelect
          id="catalog-chapter"
          label="Chapter"
          name="chapter"
          value={listing.chapter}
          fallbackLabel={listing.chapter && `Chapter ${listing.chapter}`}
          options={counts("chapter").map(([ch, n]) => [ch, `Chapter ${ch}`, n])}
        />
        <button type="submit" className={secondary}>
          Apply
        </button>
        {filtered && (
          <Link href="/app/catalog" className="text-brand text-sm underline">
            Clear filters
          </Link>
        )}
      </form>

      <p className="text-muted text-sm" role="status">
        {total === 0
          ? "No products match these filters."
          : `Showing ${(from + 1).toLocaleString()}–${Math.min(from + PAGE_SIZE, total).toLocaleString()} of ${total.toLocaleString()}`}
      </p>

      {total > 0 && <CatalogTable rows={rows.data as CatalogRow[]} />}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-4 text-sm">
          {listing.page > 1 ? (
            <Link
              href={listingHref(listing, { page: listing.page - 1 })}
              className="text-brand underline"
            >
              Previous
            </Link>
          ) : (
            <span className="text-muted">Previous</span>
          )}
          <span>
            Page {listing.page} of {pages}
          </span>
          {listing.page < pages ? (
            <Link
              href={listingHref(listing, { page: listing.page + 1 })}
              className="text-brand underline"
            >
              Next
            </Link>
          ) : (
            <span className="text-muted">Next</span>
          )}
        </nav>
      )}
    </div>
  );
}

const countOf = (pairs: (readonly [string, number])[], key: CatalogStatus) =>
  pairs.find(([k]) => k === key)?.[1] ?? 0;

function FilterSelect({
  id,
  label,
  name,
  value,
  options,
  fallbackLabel,
}: {
  id: string;
  label: string;
  name: string;
  value: string | undefined;
  options: (readonly [string, string, number])[];
  /** Label for the active value when no product has it any more. */
  fallbackLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value ?? ""} className={field}>
        <option value="">All</option>
        {/* A filter with no products left still shows as chosen, not as "All". */}
        {value && !options.some(([v]) => v === value) && (
          <option value={value}>{fallbackLabel ?? value} (0)</option>
        )}
        {options.map(([v, text, n]) => (
          <option key={v} value={v}>
            {text} ({n.toLocaleString()})
          </option>
        ))}
      </select>
    </div>
  );
}
