"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { searchFilter } from "@/lib/catalog/listing";
import { computeQuote, type ComputedQuote } from "@/lib/landed-cost/quote";
import { quoteInputSchema, saveQuoteSchema } from "@/lib/landed-cost/schema";
import { figuresDigest, totalsToStore } from "@/lib/landed-cost/stored";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";

// CD-051: search products, price a quote and save it. The form sends the person's choices as one
// JSON field; Zod checks it, and the server loads codes, rates, fees and programs itself, so no
// number from the browser is trusted beyond quantities, unit values and the exchange rate.

export type ProductHit = {
  id: string;
  title: string;
  sku: string | null;
  code: string | null;
  status: string | null;
  customsValue: string | null;
  currency: string | null;
  origin: string | null;
};

export type CalcState =
  | { status: "idle" }
  | { status: "priced"; quote: ComputedQuote }
  | { status: "error"; message: string; errors?: Record<string, string> };

const MAX_PAYLOAD = 64 * 1024;

/** What to tell the person when save_quote refuses (0007_quotes.sql). */
function saveFailure(error: { code?: string; message?: string } | null) {
  if (error?.code === "42501")
    return "You can't save quotes in this workspace.";
  if (error?.message === "too_many_quotes")
    return "You've saved a lot of quotes in the last hour. Try again later.";
  if (error?.message === "quote_limit")
    return "This workspace has reached its limit of 2,000 saved quotes. Ask an owner or admin to delete old ones.";
  return "Couldn't save the quote because of a problem on our side. Try again.";
}

async function session() {
  const ctx = await getWorkspaceContext();
  const supabase = await createClient();
  if (!ctx?.workspace || !supabase) return null;
  return { ctx: { ...ctx, workspace: ctx.workspace }, supabase };
}

function readPayload(form: FormData): unknown {
  const raw = form.get("payload");
  if (typeof raw !== "string" || raw.length > MAX_PAYLOAD) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Zod issues keyed like the form: "origin", "lines.0.quantity", "name". */
function fieldErrors(error: z.ZodError, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.filter((p) => p !== prefix).join(".");
    out[path || "form"] ??= issue.message;
  }
  return out;
}

const searchSchema = z.string().max(100);

export type SearchResult =
  { ok: true; hits: ProductHit[] } | { ok: false; message: string };

export async function searchProducts(query: string): Promise<SearchResult> {
  const q = searchSchema.safeParse(query);
  if (!q.success)
    return { ok: false, message: "Search for at most 100 characters." };
  const s = await session();
  if (!s)
    return { ok: false, message: "Your session has ended. Sign in again." };
  let request = s.supabase
    .from("catalog_items")
    .select(
      "id, title, sku, code, status, customs_value::text, currency, origin_country",
    )
    .eq("workspace_id", s.ctx.workspace.id)
    .order("title")
    .limit(20);
  const filter = searchFilter(q.data);
  if (filter) request = request.or(filter);
  const { data, error } = await request;
  if (error || !data)
    return { ok: false, message: "Couldn't search your catalog. Try again." };
  return {
    ok: true,
    hits: data.map((r) => ({
      id: r.id ?? "",
      title: r.title ?? "",
      sku: r.sku,
      code: r.code,
      status: r.status,
      customsValue: r.customs_value,
      currency: r.currency,
      origin: r.origin_country,
    })),
  };
}

export async function calculateQuote(
  _prev: CalcState,
  form: FormData,
): Promise<CalcState> {
  const parsed = quoteInputSchema.safeParse(readPayload(form));
  if (!parsed.success)
    return {
      status: "error",
      message: "Fix the highlighted fields.",
      errors: fieldErrors(parsed.error),
    };
  const s = await session();
  if (!s)
    return {
      status: "error",
      message: "Your session has ended. Sign in again.",
    };
  const quote = await computeQuote(s.supabase, s.ctx.workspace.id, parsed.data);
  if (!quote.ok) return { status: "error", message: quote.message };
  return { status: "priced", quote };
}

export async function saveQuote(
  _prev: CalcState,
  form: FormData,
): Promise<CalcState> {
  const parsed = saveQuoteSchema.safeParse({
    name: form.get("name"),
    shown: form.get("shown"),
    input: readPayload(form),
  });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error, "input");
    // The total travels in a hidden field: if only that is wrong, there is nothing to highlight.
    const hiddenOnly = Object.keys(errors).every((k) => k === "shown");
    return {
      status: "error",
      message: hiddenOnly
        ? "Calculate again, then save."
        : "Fix the highlighted fields.",
      errors,
    };
  }
  const s = await session();
  if (!s)
    return {
      status: "error",
      message: "Your session has ended. Sign in again.",
    };
  if (s.ctx.workspace.role === "viewer")
    return {
      status: "error",
      message:
        "Viewers can't save quotes. Ask an owner or admin to change your role.",
    };

  // Priced again here: what is saved is what the server computed now, never the browser's copy.
  const quote = await computeQuote(
    s.supabase,
    s.ctx.workspace.id,
    parsed.data.input,
  );
  if (!quote.ok) return { status: "error", message: quote.message };
  const { input, result } = quote;
  // The data can change between Calculate and Save (a measure published, a code confirmed).
  // Never save figures the person has not seen.
  if (parsed.data.shown !== figuresDigest(result, quote.lines))
    return {
      status: "error",
      message:
        "The tariff data or a product's code changed since you calculated, so the figures are different now. Calculate again, then save.",
    };
  const { data: id, error } = await s.supabase.rpc("save_quote", {
    p_workspace: s.ctx.workspace.id,
    p_quote: {
      name: parsed.data.name,
      origin: input.origin,
      mode: input.mode,
      entry_date: input.entryDate,
      currency: input.currency,
      fx_rate_to_usd: input.fxRateToUsd,
      carrier: input.carrier ?? "",
      status: result.status,
      tariff_revision_id: quote.revisionId,
      totals: totalsToStore(result, quote.notices),
    },
    p_lines: quote.lines.map((l) => ({
      product_id: l.productId,
      quantity: l.quantity,
      unit_value: l.unitValue,
      code_used: l.code,
      used_suggested: !l.confirmed,
      breakdown: l.result,
      title: l.title,
      sku: l.sku ?? "",
    })),
  });
  if (error || !id) return { status: "error", message: saveFailure(error) };
  revalidatePath("/app/landed-cost");
  redirect(`/app/landed-cost/quotes/${id}?saved=1`);
}
