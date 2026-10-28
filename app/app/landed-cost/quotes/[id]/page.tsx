import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadSavedQuote } from "@/lib/landed-cost/saved";
import { createClient } from "@/lib/supabase/server";
import { primary } from "@/lib/ui/styles";
import { getWorkspaceContext } from "@/lib/workspace";
import { CostBreakdown } from "../../cost-breakdown";

export const metadata: Metadata = { title: "Quote · ClearDuty" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// CD-051: a saved quote, exactly as it was priced (not recomputed with today's data).
export default async function QuotePage(
  props: PageProps<"/app/landed-cost/quotes/[id]">,
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/sign-in?next=/app/landed-cost");
  if (!ctx.workspace) redirect("/app");
  const { id } = await props.params;
  const { saved } = await props.searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const quote = await loadSavedQuote(supabase, ctx.workspace.id, id);
  if (!quote) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/app/landed-cost" className="text-brand text-sm underline">
        ← Landed cost
      </Link>
      {quote === "unreadable" ? (
        <p role="alert" className="text-risk text-sm">
          This quote&apos;s saved figures are not in a form we can show. Price
          it again from the calculator.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{quote.name}</h1>
              <p className="text-muted mt-1 text-sm">
                Saved {quote.createdAt.slice(0, 10)} · entry date{" "}
                {quote.entryDate} · origin {quote.origin} · {quote.mode}
                {quote.currency !== "USD" &&
                  ` · ${quote.currency} at ${quote.fxRateToUsd} USD`}
                {quote.carrier && ` · ${quote.carrier}`}
              </p>
            </div>
            <a
              href={`/app/landed-cost/quotes/${quote.id}/pdf`}
              className={primary}
              download
            >
              Download PDF
            </a>
          </div>
          {saved === "1" && (
            <p role="status" className="text-confirmed text-sm">
              Quote saved.
            </p>
          )}
          <p className="text-muted text-xs">
            Figures as priced when saved. Tariffs change: calculate again for
            today&apos;s rates.
          </p>
          <CostBreakdown
            data={{
              ...quote.totals,
              currency: quote.currency,
              lines: quote.lines,
            }}
          />
        </>
      )}
    </div>
  );
}
