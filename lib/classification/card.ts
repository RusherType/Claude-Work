import "server-only";
import type { CatalogStatus } from "@/lib/catalog/listing";
import type { createClient } from "@/lib/supabase/server";
import {
  citedRulings,
  readAlternatives,
  readCitations,
  readGriPath,
  rulingUrl,
  type Alternative,
  type Citation,
} from "./result";

// CD-042: everything the classification card shows for one product, read with the user's
// session (RLS decides what is visible). Errors throw and reach app/app/error.tsx.

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export type CardClassification = {
  id: string;
  code: string | null;
  status: CatalogStatus;
  source: "ai" | "override" | "broker";
  confidence: number | null;
  reasoning: string | null;
  griPath: string[];
  alternatives: Alternative[];
  citations: Citation[];
  overrideReason: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
};

export type Ruling = {
  number: string;
  date: string | null;
  subject: string | null;
  status: string;
  url: string | null;
};

export type HistoryEntry = {
  id: string;
  code: string | null;
  status: CatalogStatus;
  source: "ai" | "override" | "broker";
  overrideReason: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
  current: boolean;
};

export type Question = { id: string; question: string; options: string[] };

export type CardData = {
  current: CardClassification | null;
  breadcrumb: { code: string; description: string }[];
  rulings: Ruling[];
  history: HistoryEntry[];
  questions: Question[];
};

const HISTORY_LIMIT = 20;

/** Answer chips: 2 to 5 short strings, as the agent stores them (anything else: free text only). */
function readOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((o): o is string => typeof o === "string" && o.trim() !== "")
    .map((o) => o.trim().slice(0, 100))
    .slice(0, 5);
}

export async function loadCard(
  supabase: Client,
  workspaceId: string,
  productId: string,
): Promise<CardData> {
  const [rows, members] = await Promise.all([
    supabase
      .from("classifications")
      .select(
        "id, code, status, source, confidence, reasoning, gri_path, alternatives, citations, override_reason, confirmed_by, confirmed_at, created_at, is_current, tariff_revision_id, agent_run_id",
      )
      .eq("workspace_id", workspaceId)
      .eq("product_id", productId)
      .eq("market", "US")
      .order("is_current", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase.rpc("workspace_members", { p_workspace: workspaceId }),
  ]);
  if (rows.error || members.error)
    throw new Error("Could not load the classification");

  const names = new Map(
    (members.data ?? []).map((m) => [m.user_id, m.full_name || m.email]),
  );
  // Someone who has left the workspace still shows as a person, not as nothing.
  const who = (id: string | null) =>
    id ? (names.get(id) ?? "A former member") : null;

  const currentRow = rows.data.find((r) => r.is_current) ?? null;
  const current: CardClassification | null = currentRow && {
    id: currentRow.id,
    code: currentRow.code,
    status: currentRow.status as CatalogStatus,
    source: currentRow.source,
    confidence: currentRow.confidence,
    reasoning: currentRow.reasoning,
    griPath: readGriPath(currentRow.gri_path),
    alternatives: readAlternatives(currentRow.alternatives),
    citations: readCitations(currentRow.citations),
    overrideReason: currentRow.override_reason,
    confirmedBy: who(currentRow.confirmed_by),
    confirmedAt: currentRow.confirmed_at,
    createdAt: currentRow.created_at ?? "",
  };

  const [breadcrumb, rulings, questions] = await Promise.all([
    loadBreadcrumb(supabase, currentRow?.tariff_revision_id ?? null, current),
    loadRulings(supabase, current ? citedRulings(current.citations) : []),
    // Only the open questions of the run behind a code that waits for them (older ones are
    // stale, and answer_agent_question refuses them).
    currentRow?.status === "needs_answer"
      ? loadQuestions(supabase, workspaceId, productId, currentRow.agent_run_id)
      : [],
  ]);

  return {
    current,
    breadcrumb,
    rulings,
    history: rows.data.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status as CatalogStatus,
      source: r.source,
      overrideReason: r.override_reason,
      confirmedBy: who(r.confirmed_by),
      confirmedAt: r.confirmed_at,
      createdAt: r.created_at ?? "",
      current: r.is_current === true,
    })),
    questions,
  };
}

async function loadQuestions(
  supabase: Client,
  workspaceId: string,
  productId: string,
  runId: string | null,
): Promise<Question[]> {
  const query = supabase
    .from("agent_questions")
    .select("id, question, options")
    .eq("workspace_id", workspaceId)
    .eq("product_id", productId)
    .is("answered_at", null);
  const { data, error } = await (
    runId ? query.eq("agent_run_id", runId) : query.is("agent_run_id", null)
  )
    .order("id")
    .limit(10);
  if (error) throw new Error("Could not load the agent's questions");
  return data.map((q) => ({
    id: q.id,
    question: q.question,
    options: readOptions(q.options),
  }));
}

/** Heading to line, from the revision the code was decided in (or the one in force). */
async function loadBreadcrumb(
  supabase: Client,
  revisionId: string | null,
  current: CardClassification | null,
) {
  if (!current?.code) return [];
  let revision = revisionId;
  if (!revision) {
    const inForce = await supabase.rpc("revision_in_force", {
      p_market: "US",
    });
    if (inForce.error) throw new Error("Could not load the tariff");
    revision = inForce.data;
  }
  if (!revision) return [];
  const { data, error } = await supabase.rpc("hts_breadcrumb", {
    p_revision: revision,
    p_code: current.code,
  });
  if (error) throw new Error("Could not load the tariff");
  return data.map((l) => ({ code: l.code, description: l.description }));
}

async function loadRulings(
  supabase: Client,
  numbers: string[],
): Promise<Ruling[]> {
  if (numbers.length === 0) return [];
  const { data, error } = await supabase
    .from("rulings")
    .select("number, ruling_date, subject, status, url")
    .in("number", numbers);
  if (error) throw new Error("Could not load the rulings");
  const found = new Map(data.map((r) => [r.number, r]));
  // In the order cited; a ruling not in our index still shows by number.
  return numbers.map((n) => {
    const r = found.get(n);
    return {
      number: n,
      date: r?.ruling_date ?? null,
      subject: r?.subject ?? null,
      status: r?.status ?? "unknown",
      url: rulingUrl(r?.url),
    };
  });
}
