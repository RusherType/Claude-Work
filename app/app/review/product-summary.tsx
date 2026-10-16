import Link from "next/link";
import type { Facts } from "@/lib/catalog/facts";
import { COUNTRIES } from "@/lib/countries";

const COUNTRY_NAMES = new Map(COUNTRIES.map((c) => [c.code, c.name]));

export type SummaryProduct = {
  id: string;
  title: string;
  sku: string | null;
  description: string | null;
  imageUrl: string | null;
  originCountry: string | null;
  customsValue: string | null;
  currency: string | null;
  facts: Facts;
};

/** What the reviewer needs to judge the code, without leaving the queue. */
export function ProductSummary({ product: p }: { product: SummaryProduct }) {
  const materials = p.facts.materials
    .map((m) => (m.percent ? `${m.percent}% ${m.name}` : m.name))
    .join(", ");
  const rows: [string, string | null][] = [
    ["Materials", materials || null],
    ["What it does", p.facts.function],
    ["Who uses it", p.facts.user],
    ["How it's made", p.facts.form],
    [
      "Origin",
      p.originCountry
        ? (COUNTRY_NAMES.get(p.originCountry) ?? p.originCountry)
        : null,
    ],
    [
      "Customs value",
      p.customsValue ? `${p.customsValue} ${p.currency ?? ""}`.trim() : null,
    ],
  ];
  return (
    <section
      aria-labelledby="product-heading"
      className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4"
    >
      <div className="flex gap-3">
        {p.imageUrl ? (
          // Seller-provided images on any https host; next/image would need every host allow-listed.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.imageUrl}
            alt=""
            width={96}
            height={96}
            referrerPolicy="no-referrer"
            className="size-24 shrink-0 rounded object-cover"
          />
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="product-heading" className="text-lg font-semibold">
            <Link href={`/app/catalog/${p.id}`} className="hover:underline">
              {p.title}
            </Link>
          </h2>
          <p className="text-muted font-mono text-xs">{p.sku ?? "No SKU"}</p>
        </div>
      </div>
      {p.description && (
        <p className="line-clamp-4 text-sm whitespace-pre-line">
          {p.description}
        </p>
      )}
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="break-words">{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
