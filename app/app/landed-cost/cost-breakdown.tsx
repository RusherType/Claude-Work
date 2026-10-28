import type { Component, LineResult } from "@/lib/tariff/landed-cost/types";
import { formatHtsCode } from "@/lib/catalog/listing";
import { Decimal, formatUsd } from "@/lib/tariff/money";

// CD-051: every figure expands into its rate, basis, source and effective date
// (docs/04-frontend.md principle 2, CostBreakdown). Shared by the calculator and saved quotes.

export type BreakdownLine = {
  title: string;
  sku: string | null;
  code: string;
  confirmed: boolean;
  quantity: number;
  unitValue: string;
  result: LineResult;
};

export type BreakdownData = {
  status: "ok" | "needs_review";
  entryType: "formal" | "informal";
  currency: string;
  lines: BreakdownLine[];
  shipmentFees: Component[];
  totals: {
    customsValue: string;
    duties: string;
    fees: string;
    landedCost: string;
  };
  warnings: string[];
  notices: string[];
};

const money = (s: string) => formatUsd(new Decimal(s));

function Source({ c }: { c: Component }) {
  const s = c.source;
  if (!s) return null;
  if (s.table === "tariff_lines")
    return (
      <span>
        HTSUS {formatHtsCode(s.code)}, {s.column} rate
        {s.program ? ` (${s.program})` : ""}
      </span>
    );
  const dates = s.effectiveTo
    ? `${s.effectiveFrom} to ${s.effectiveTo}`
    : `from ${s.effectiveFrom}`;
  return (
    <span>
      In force {dates}
      {s.sourceUrl && (
        <>
          {" · "}
          <a
            href={s.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand underline"
          >
            Source
          </a>
        </>
      )}
    </span>
  );
}

function Components({ items }: { items: Component[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((c, i) => (
        <li key={i} className="grid grid-cols-[1fr_auto] gap-x-4 text-sm">
          <span>{c.label}</span>
          <span className="font-mono tabular-nums">{money(c.amount)}</span>
          <span className="text-muted col-span-2 text-xs">
            {c.basis}
            {c.source && " · "}
            <Source c={c} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CostBreakdown({ data }: { data: BreakdownData }) {
  const review = data.status === "needs_review";
  return (
    <section
      aria-labelledby="breakdown-heading"
      className="flex flex-col gap-4"
    >
      <h2 id="breakdown-heading" className="text-base font-semibold">
        Breakdown
      </h2>
      {data.notices.map((n) => (
        <p key={n} className="text-info text-sm">
          {n}
        </p>
      ))}
      {review && (
        <p className="border-review text-review rounded-md border p-3 text-sm">
          Needs review: some of this can&apos;t be priced with certainty from
          the data we have. Check the notes below before you rely on the total.
        </p>
      )}

      {data.lines.map((l) => (
        <article
          key={l.result.id}
          aria-label={l.title}
          className="border-border bg-surface flex flex-col gap-2 rounded-lg border p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">{l.title}</h3>
            <span className="text-muted text-xs">
              <span className="font-mono">{formatHtsCode(l.code)}</span>
              {l.confirmed ? " · Confirmed code" : " · Suggested code"}
            </span>
          </div>
          <p className="text-muted text-xs">
            {l.quantity} × {l.unitValue} {data.currency} · customs value{" "}
            {money(l.result.customsValueUsd)}
          </p>
          <Components items={l.result.components} />
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 text-sm">
            <dt className="text-muted">Duty</dt>
            <dd className="font-mono tabular-nums">
              {money(l.result.dutyTotal)}
            </dd>
            <dt className="text-muted">Share of fees</dt>
            <dd className="font-mono tabular-nums">
              {money(l.result.allocatedFees)}
            </dd>
            <dt className="font-medium">Landed cost</dt>
            <dd className="font-mono font-semibold tabular-nums">
              {money(l.result.landedCost)}
            </dd>
          </dl>
          {l.result.warnings.length > 0 && (
            <ul className="text-review list-disc pl-5 text-xs">
              {l.result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </article>
      ))}

      <div className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">
          Shipment fees ({data.entryType} entry)
        </h3>
        {data.shipmentFees.length > 0 ? (
          <Components items={data.shipmentFees} />
        ) : (
          <p className="text-muted text-sm">No shipment fees apply.</p>
        )}
        <dl className="border-border grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t pt-3 text-sm">
          <dt className="text-muted">Customs value</dt>
          <dd className="font-mono tabular-nums">
            {money(data.totals.customsValue)}
          </dd>
          <dt className="text-muted">Duty you&apos;ll pay</dt>
          <dd className="font-mono tabular-nums">
            {money(data.totals.duties)}
          </dd>
          <dt className="text-muted">Fees</dt>
          <dd className="font-mono tabular-nums">{money(data.totals.fees)}</dd>
          <dt className="text-base font-semibold">Landed cost</dt>
          <dd
            className="font-mono text-base font-bold tabular-nums"
            data-testid="landed-cost-total"
          >
            {money(data.totals.landedCost)}
          </dd>
        </dl>
        {data.warnings.length > 0 && (
          <ul className="text-review list-disc pl-5 text-xs">
            {data.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        <p className="text-muted text-xs">
          An estimate from published tariff data, not a customs ruling. Amounts
          in US dollars.
        </p>
      </div>
    </section>
  );
}
