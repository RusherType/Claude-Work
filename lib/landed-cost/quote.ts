import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { landedCost } from "@/lib/tariff/landed-cost";
import type {
  LandedCostResult,
  LineResult,
} from "@/lib/tariff/landed-cost/types";
import {
  toCostLine,
  toFee,
  toMeasure,
  toPrograms,
  type QuoteProduct,
} from "./engine-input";
import type { QuoteInput } from "./schema";

// CD-051: a quote computed on the server with the user's session. Codes come from each product's
// current US classification, rates from the tariff revision in force, and measures, fees and
// programs from published rows only (RLS shows drafts to admins, so `published` is filtered here
// too). The engine does every calculation (CLAUDE.md: no money math anywhere else).

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export type QuoteLineView = {
  productId: string;
  title: string;
  sku: string | null;
  code: string;
  confirmed: boolean;
  quantity: number;
  unitValue: string;
  result: LineResult;
};

export type ComputedQuote = {
  ok: true;
  input: QuoteInput;
  revisionId: string | null;
  result: LandedCostResult;
  lines: QuoteLineView[];
  /** Notes about the data itself (e.g. no tariff loaded yet), shown above the breakdown. */
  notices: string[];
};
export type QuoteFailure = { ok: false; message: string };

const MEASURE_COLUMNS =
  "id, authority, ch99_code, hts_prefixes, excluded_prefixes, origin_countries, rate_type, rate_value::text, applies_to_modes, exempt_programs, effective_from, effective_to, source_url";
const FEE_COLUMNS =
  "id, fee_type, mode, carrier, pct::text, flat_amount::text, min_amount::text, max_amount::text, effective_from, effective_to, source_url";
const PROGRAM_COLUMNS =
  "symbol, countries, mpf_exempt, effective_from, effective_to, source_url";

const fail = (message: string): QuoteFailure => ({ ok: false, message });

export async function computeQuote(
  supabase: Client,
  workspaceId: string,
  input: QuoteInput,
): Promise<ComputedQuote | QuoteFailure> {
  const ids = input.lines.map((l) => l.productId);
  const day = input.entryDate;
  const [products, codes, revision, measures, fees, programs] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, title, sku, weight_kg::text")
        .eq("workspace_id", workspaceId)
        .in("id", ids),
      supabase
        .from("catalog_items")
        .select("id, code, status")
        .eq("workspace_id", workspaceId)
        .in("id", ids),
      supabase.rpc("revision_in_force", { p_market: "US" }),
      supabase
        .from("tariff_measures")
        .select(MEASURE_COLUMNS)
        .eq("market", "US")
        .eq("published", true)
        .contains("applies_to_modes", [input.mode])
        .lte("effective_from", day)
        .or(`effective_to.is.null,effective_to.gte.${day}`),
      supabase
        .from("fee_schedules")
        .select(FEE_COLUMNS)
        .eq("market", "US")
        .eq("published", true)
        .lte("effective_from", day)
        .or(`effective_to.is.null,effective_to.gte.${day}`),
      supabase
        .from("special_programs")
        .select(PROGRAM_COLUMNS)
        .eq("market", "US")
        .eq("published", true),
    ]);
  for (const r of [products, codes, revision, measures, fees, programs])
    if (r.error) return fail("Couldn't load the tariff data. Try again.");

  const productById = new Map(products.data!.map((p) => [p.id, p]));
  const codeById = new Map(codes.data!.map((c) => [c.id, c]));
  const quoteProducts: (QuoteProduct & {
    title: string;
    sku: string | null;
  })[] = [];
  for (const line of input.lines) {
    const p = productById.get(line.productId);
    if (!p)
      return fail("A product in this quote is no longer in your catalog.");
    const c = codeById.get(line.productId);
    if (!c?.code || !/^\d{10}$/.test(c.code))
      return fail(
        `“${p.title}” has no 10-digit tariff code yet. Confirm or set its code first.`,
      );
    quoteProducts.push({
      id: p.id,
      title: p.title,
      sku: p.sku,
      code: c.code,
      status: c.status ?? "suggested",
      weightKg: p.weight_kg,
    });
  }

  const revisionId = revision.data ?? null;
  const notices: string[] = [];
  let tariffLines: {
    code: string;
    general_rate_raw: string | null;
    special_rate_raw: string | null;
    column2_rate_raw: string | null;
  }[] = [];
  if (revisionId) {
    const lines = await supabase
      .from("tariff_lines")
      .select("code, general_rate_raw, special_rate_raw, column2_rate_raw")
      .eq("revision_id", revisionId)
      .eq("is_leaf", true)
      .in(
        "code",
        quoteProducts.map((p) => p.code),
      );
    if (lines.error) return fail("Couldn't load the tariff data. Try again.");
    tariffLines = lines.data;
  } else {
    notices.push(
      "No US tariff schedule is loaded yet, so duty rates are missing and every line needs review.",
    );
  }
  const lineByCode = new Map(tariffLines.map((l) => [l.code, l]));
  const { programs: programRows, column2Countries } = toPrograms(
    programs.data!,
    day,
  );

  let result: LandedCostResult;
  try {
    result = landedCost({
      lines: input.lines.map((l, i) =>
        toCostLine(
          quoteProducts[i],
          lineByCode.get(quoteProducts[i].code),
          l.quantity,
          l.unitValue,
          input.origin,
        ),
      ),
      shipment: {
        mode: input.mode,
        entryDate: day,
        currency: input.currency,
        fxRateToUsd: input.fxRateToUsd,
        ...(input.carrier ? { carrier: input.carrier } : {}),
        column2Countries,
      },
      measures: measures.data!.map(toMeasure),
      fees: fees.data!.map(toFee),
      programs: programRows,
    });
  } catch (e) {
    // The engine refuses malformed reference data instead of guessing; nothing to show the user
    // beyond "we can't price this", and the details go to the server log.
    console.error("landed-cost engine refused the input", e);
    return fail(
      "Some tariff data for this quote is malformed, so it can't be priced. We've logged the problem.",
    );
  }

  return {
    ok: true,
    input,
    revisionId,
    result,
    notices,
    lines: input.lines.map((l, i) => ({
      productId: l.productId,
      title: quoteProducts[i].title,
      sku: quoteProducts[i].sku,
      code: quoteProducts[i].code,
      confirmed:
        quoteProducts[i].status === "confirmed" ||
        quoteProducts[i].status === "broker_verified",
      quantity: l.quantity,
      unitValue: l.unitValue,
      result: result.lines[i],
    })),
  };
}
