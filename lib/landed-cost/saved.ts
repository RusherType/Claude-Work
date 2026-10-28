import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { LineResult } from "@/lib/tariff/landed-cost/types";
import {
  lineResultSchema,
  storedTotalsSchema,
  type StoredTotals,
} from "./stored";

// CD-051: a saved quote, read with the user's session (RLS scopes it to their workspaces).

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export type SavedLine = {
  title: string;
  sku: string | null;
  code: string;
  confirmed: boolean;
  quantity: number;
  unitValue: string;
  result: LineResult;
};

export type SavedQuote = {
  id: string;
  name: string;
  origin: string;
  mode: string;
  entryDate: string;
  currency: string;
  fxRateToUsd: string;
  carrier: string | null;
  createdAt: string;
  totals: StoredTotals;
  lines: SavedLine[];
};

/** The quote, null when it does not exist (or is not visible), or "unreadable" when malformed. */
export async function loadSavedQuote(
  supabase: Client,
  workspaceId: string,
  id: string,
): Promise<SavedQuote | null | "unreadable"> {
  const [quote, lines] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id, name, origin, mode, entry_date, currency, fx_rate_to_usd::text, carrier, created_at, totals",
      )
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("quote_lines")
      .select(
        "title, sku, code_used, used_suggested, quantity, unit_value::text, breakdown, position",
      )
      .eq("workspace_id", workspaceId)
      .eq("quote_id", id)
      .order("position"),
  ]);
  if (quote.error || lines.error) throw new Error("Could not load the quote");
  const q = quote.data;
  if (!q) return null;

  const totals = storedTotalsSchema.safeParse(q.totals);
  if (!totals.success) return "unreadable";
  const savedLines: SavedLine[] = [];
  for (const l of lines.data) {
    const result = lineResultSchema.safeParse(l.breakdown);
    if (!result.success) return "unreadable";
    savedLines.push({
      title: l.title ?? "",
      sku: l.sku,
      code: l.code_used ?? "",
      confirmed: l.used_suggested === false,
      quantity: l.quantity,
      unitValue: l.unit_value ?? "0",
      result: result.data,
    });
  }
  return {
    id: q.id,
    name: q.name ?? "",
    origin: q.origin ?? "",
    mode: q.mode ?? "",
    entryDate: q.entry_date ?? "",
    currency: q.currency ?? "",
    fxRateToUsd: q.fx_rate_to_usd ?? "",
    carrier: q.carrier,
    createdAt: q.created_at ?? "",
    totals: totals.data,
    lines: savedLines,
  };
}
