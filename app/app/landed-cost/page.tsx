import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { COUNTRIES } from "@/lib/countries";
import { createClient } from "@/lib/supabase/server";
import { Decimal, formatUsd } from "@/lib/tariff/money";
import { getWorkspaceContext } from "@/lib/workspace";
import { Calculator } from "./calculator";

export const metadata: Metadata = { title: "Landed cost · ClearDuty" };

// CD-051: price a shipment of catalog products (duty, overlays, fees) and save it as a quote.

const MODES = new Set(["postal", "express", "ocean", "air"]);

export default async function LandedCostPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/sign-in?next=/app/landed-cost");
  if (!ctx.workspace) redirect("/app");
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");

  // Errors surface through app/app/error.tsx (plain message + retry).
  const [workspace, quotes] = await Promise.all([
    supabase
      .from("workspaces")
      .select("default_origin, default_mode")
      .eq("id", ctx.workspace.id)
      .maybeSingle(),
    supabase
      .from("quotes")
      .select("id, name, created_at, status, totals->totals->>landedCost")
      .eq("workspace_id", ctx.workspace.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (workspace.error || quotes.error)
    throw new Error("Could not load the calculator");

  const defaultMode = workspace.data?.default_mode ?? "";
  const defaults = {
    origin: workspace.data?.default_origin?.trim() ?? "",
    mode: MODES.has(defaultMode) ? defaultMode : "express",
    entryDate: new Date().toISOString().slice(0, 10),
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Landed cost</h1>
        <p className="text-muted mt-1 text-sm">
          What a shipment costs once it lands in the US: duty, every extra
          tariff that applies, and customs fees, each with its source.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Calculator
          defaults={defaults}
          countries={COUNTRIES}
          canSave={ctx.workspace.role !== "viewer"}
        />
        <aside
          aria-labelledby="quotes-heading"
          className="border-border bg-surface flex h-fit flex-col gap-2 rounded-lg border p-4"
        >
          <h2 id="quotes-heading" className="text-base font-semibold">
            Saved quotes
          </h2>
          {quotes.data.length === 0 ? (
            <p className="text-muted text-sm">
              No quotes yet. Calculate one and save it to keep a record.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {quotes.data.map((q) => (
                <li key={q.id} className="flex flex-col">
                  <Link
                    href={`/app/landed-cost/quotes/${q.id}`}
                    className="text-brand underline"
                  >
                    {q.name}
                  </Link>
                  <span className="text-muted text-xs">
                    {q.created_at?.slice(0, 10)}
                    {typeof q.landedCost === "string" &&
                    /^\d{1,12}(\.\d{1,2})?$/.test(q.landedCost)
                      ? ` · ${formatUsd(new Decimal(q.landedCost))}`
                      : ""}
                    {q.status === "needs_review" ? " · Needs review" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
