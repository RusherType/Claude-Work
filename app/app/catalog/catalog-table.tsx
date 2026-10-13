"use client";

import Link from "next/link";
import { useState } from "react";
import { toCsv } from "@/lib/catalog/csv";
import { formatHtsCode, type CatalogStatus } from "@/lib/catalog/listing";
import { primary, secondary } from "@/lib/ui/styles";
import { download } from "@/lib/ui/download";
import { StatusChip } from "./status-chip";

export type CatalogRow = {
  id: string;
  title: string;
  sku: string | null;
  origin_country: string | null;
  image_url: string | null;
  code: string | null;
  status: Exclude<CatalogStatus, "unclassified"> | null;
  checked_at: string | null;
  confidence: number | null;
};

const statusOf = (r: CatalogRow): CatalogStatus => r.status ?? "unclassified";
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export function CatalogTable({ rows }: { rows: CatalogRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const chosen = rows.filter((r) => selected.has(r.id));

  const exportSelected = () =>
    download(
      "clearduty-catalog.csv",
      toCsv([
        [
          "sku",
          "title",
          "origin_country",
          "hts_code",
          "status",
          "last_checked",
        ],
        ...chosen.map((r) => [
          r.sku ?? "",
          r.title,
          r.origin_country ?? "",
          r.code ? formatHtsCode(r.code) : "",
          statusOf(r),
          day(r.checked_at),
        ]),
      ]),
    );

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex flex-wrap items-center gap-3 text-sm"
        aria-label="Bulk actions"
        role="group"
      >
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          Select all on this page
        </label>
        <span role="status">
          {chosen.length === 0
            ? "Select products for bulk actions."
            : `${chosen.length} selected`}
        </span>
        <button
          type="button"
          className={primary}
          disabled
          aria-describedby="classify-soon"
        >
          Classify selected
        </button>
        <span id="classify-soon" className="text-muted text-xs">
          Classification arrives with the AI agent.
        </span>
        <button
          type="button"
          className={secondary}
          disabled={chosen.length === 0}
          onClick={exportSelected}
        >
          Export selected (CSV)
        </button>
      </div>

      {/* Desktop: a table. Under 768 px: stacked cards (docs/04-frontend.md). */}
      <div className="border-border bg-surface hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Products</caption>
          <thead className="text-muted text-left text-xs">
            <tr>
              <th scope="col" className="w-10 px-3 py-2">
                <span className="sr-only">Select</span>
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Product
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                SKU
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Origin
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                HTS code
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Status
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Last checked
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-border border-t align-middle">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.title}`}
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <Thumb url={r.image_url} />
                    <Link
                      href={`/app/catalog/${r.id}`}
                      className="text-brand line-clamp-2 underline"
                    >
                      {r.title}
                    </Link>
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.sku ?? "—"}</td>
                <td className="px-3 py-2">{r.origin_country ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <HtsCode code={r.code} />
                </td>
                <td className="px-3 py-2">
                  <StatusChip status={statusOf(r)} />
                  <Confidence row={r} />
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {day(r.checked_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden" aria-label="Products">
        {rows.map((r) => (
          <li
            key={r.id}
            className="border-border bg-surface flex gap-3 rounded-lg border p-3"
          >
            <input
              type="checkbox"
              aria-label={`Select ${r.title}`}
              checked={selected.has(r.id)}
              onChange={() => toggle(r.id)}
              className="mt-1"
            />
            <Thumb url={r.image_url} />
            <div className="flex min-w-0 flex-col gap-1 text-sm">
              <Link
                href={`/app/catalog/${r.id}`}
                className="text-brand font-medium underline"
              >
                {r.title}
              </Link>
              <span className="text-muted font-mono text-xs">
                {[
                  r.sku,
                  r.origin_country,
                  r.code ? formatHtsCode(r.code) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <StatusChip status={statusOf(r)} />
                <Confidence row={r} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Thumb({ url }: { url: string | null }) {
  if (!url)
    return (
      <div aria-hidden="true" className="bg-border size-10 shrink-0 rounded" />
    );
  return (
    // Seller-provided images on any https host; next/image would need every host allow-listed.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={40}
      height={40}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="size-10 shrink-0 rounded object-cover"
    />
  );
}

/** A suggested code shows how sure the agent is (docs/04-frontend.md principle 1). */
function Confidence({ row }: { row: CatalogRow }) {
  if (row.status !== "suggested" || row.confidence === null) return null;
  return (
    <span className="text-muted ml-1 text-xs">
      {Math.round(row.confidence * 100)}% sure
    </span>
  );
}

/** HTS code as 6109.10.0012 in mono, with a copy button. */
function HtsCode({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!code) return <span className="font-mono text-xs">—</span>;
  const text = formatHtsCode(code);
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-xs">{text}</span>
      <button
        type="button"
        className="text-brand text-xs underline"
        aria-label={`Copy HTS code ${text}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard blocked: the code stays visible to copy by hand.
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
