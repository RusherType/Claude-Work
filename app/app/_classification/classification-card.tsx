import type { CardData, HistoryEntry } from "@/lib/classification/card";
import {
  confidenceSegments,
  isLowConfidence,
} from "@/lib/classification/result";
import { formatHtsCode, STATUS_LABELS } from "@/lib/catalog/listing";
import { formatHts, normalizeHts } from "@/lib/tariff/hts";
import { StatusChip } from "../catalog/status-chip";
import { DecisionPanel, type Origin } from "./decision-panel";
import { HtsCode } from "./hts-code";
import { QuestionPrompt } from "./question-prompt";
import { Reasoning } from "./reasoning";
import { RulingsDrawer } from "./rulings-drawer";

// CD-042: the code with its evidence one click away (docs/04-frontend.md principle 1): where it
// sits in the tariff, how sure the agent is, why, what else it considered, the rulings it cites,
// and every earlier decision. Never presented as guaranteed: "Suggested" until a person confirms.

const CONFIRMABLE = new Set(["suggested", "in_review", "outdated"]);
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** 6109 / 6109.10 / 6109.10.00 / 6109.10.0012; anything else as stored. */
function lineCode(code: string) {
  const digits = normalizeHts(code);
  return digits ? formatHts(digits) : code;
}

export function ClassificationCard({
  data,
  productId,
  contentHash,
  canDecide,
  origin,
}: {
  data: CardData;
  productId: string;
  contentHash: string;
  canDecide: boolean;
  origin: Origin;
}) {
  const c = data.current;
  const status = c?.status ?? "unclassified";
  const suggested = status === "suggested" || status === "in_review";

  return (
    <aside
      aria-labelledby="code-heading"
      className="border-border bg-surface flex h-fit flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex flex-col gap-2">
        <h2 id="code-heading" className="text-base font-semibold">
          Tariff code
        </h2>
        <div>
          <StatusChip status={status} />
        </div>
        {c?.code ? (
          <HtsCode code={c.code} className="text-lg" />
        ) : (
          <p className="text-muted text-sm">
            {status === "needs_answer"
              ? "The agent needs an answer before it can suggest a code."
              : "Not classified yet. Suggested codes arrive with the AI agent."}
          </p>
        )}
        {suggested && c?.code && (
          <p className="text-muted text-sm">
            Suggested, not confirmed. Check it before you rely on it.
          </p>
        )}
        {status === "outdated" && (
          <p className="text-risk text-sm">
            The product or the tariff changed after this code was confirmed.
            Check it again.
          </p>
        )}
      </div>

      {c?.confidence !== null && c?.confidence !== undefined && c.code && (
        <ConfidenceBar confidence={c.confidence} />
      )}

      {data.breadcrumb.length > 0 && (
        <nav aria-label="Where this code sits in the tariff">
          <ol className="flex flex-col gap-1 text-xs">
            {data.breadcrumb.map((l, i) => {
              const last = i === data.breadcrumb.length - 1;
              return (
                <li
                  key={`${i}-${l.code}`}
                  style={{ paddingLeft: `${i * 0.75}rem` }}
                  aria-current={last ? "location" : undefined}
                >
                  {/* The line itself is the code shown above; its parents get their codes. */}
                  {l.code && !last && (
                    <span className="font-mono">{lineCode(l.code)} </span>
                  )}
                  <span className={last ? "font-medium" : "text-muted"}>
                    {l.description}
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      {c?.reasoning && (
        <section aria-labelledby="why-heading" className="flex flex-col gap-1">
          <h3 id="why-heading" className="text-sm font-semibold">
            Why the agent chose it
          </h3>
          <Reasoning text={c.reasoning} />
          {c.griPath.length > 0 && (
            <p className="text-muted text-xs">
              Rules applied: {c.griPath.join(", ")}
            </p>
          )}
        </section>
      )}

      {c?.source === "override" && c.overrideReason && (
        <p className="text-sm">
          <span className="font-medium">Reason given: </span>
          {c.overrideReason}
        </p>
      )}
      {c?.code && (
        <p className="text-muted text-xs">
          {c.source === "override"
            ? "Set by your team, not by the agent."
            : c.source === "broker"
              ? "Verified by a licensed customs broker."
              : `Suggested by the agent on ${day(c.createdAt)}.`}
        </p>
      )}
      {c?.confirmedAt &&
        (status === "confirmed" || status === "broker_verified") && (
          <p className="text-muted text-xs">
            Confirmed by {c.confirmedBy ?? "a team member"} on{" "}
            {day(c.confirmedAt)}
          </p>
        )}

      {c && c.alternatives.length > 0 && (
        <section aria-labelledby="alt-heading" className="flex flex-col gap-1">
          <h3 id="alt-heading" className="text-sm font-semibold">
            Other codes considered
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {c.alternatives.map((a) => (
              <li key={a.code}>
                <span className="font-mono">{formatHtsCode(a.code)}</span>
                <span className="text-muted"> — {a.why}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c && (c.citations.length > 0 || data.rulings.length > 0) && (
        <section aria-labelledby="cite-heading" className="flex flex-col gap-2">
          <h3 id="cite-heading" className="text-sm font-semibold">
            Evidence
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {c.citations.map((ct, i) =>
              ct.kind === "note" ? (
                <li key={i}>
                  {ct.ref}
                  {ct.note && <span className="text-muted"> — {ct.note}</span>}
                </li>
              ) : (
                <li key={i}>
                  Ruling <span className="font-mono">{ct.number}</span>
                  {ct.note && <span className="text-muted"> — {ct.note}</span>}
                </li>
              ),
            )}
          </ul>
          <div>
            <RulingsDrawer rulings={data.rulings} />
          </div>
        </section>
      )}

      {data.questions.length > 0 && (
        <section
          aria-labelledby="questions-heading"
          className="flex flex-col gap-2"
        >
          <h3 id="questions-heading" className="text-sm font-semibold">
            Questions from the agent
          </h3>
          {canDecide ? (
            data.questions.map((q, i) => (
              <QuestionPrompt
                key={q.id}
                question={q}
                productId={productId}
                classificationId={c?.id ?? null}
                origin={origin}
                first={i === 0}
              />
            ))
          ) : (
            <ul className="list-disc pl-5 text-sm">
              {data.questions.map((q) => (
                <li key={q.id}>{q.question}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canDecide && (
        <DecisionPanel
          productId={productId}
          contentHash={contentHash}
          current={c && { id: c.id, code: c.code }}
          canConfirm={!!c?.code && CONFIRMABLE.has(status)}
          origin={origin}
        />
      )}

      {data.history.some((e) => !e.current) && (
        <History entries={data.history.filter((e) => !e.current)} />
      )}
    </aside>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const filled = confidenceSegments(confidence);
  const pct = Math.round(confidence * 100);
  const low = isLowConfidence(confidence);
  return (
    <div className="flex flex-col gap-1">
      <div
        role="img"
        aria-label={`Agent confidence ${pct}%, ${filled} of 5`}
        className="flex gap-1"
      >
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < filled ? (low ? "bg-review" : "bg-brand") : "bg-border"
            }`}
          />
        ))}
      </div>
      <p className={`text-xs ${low ? "text-review" : "text-muted"}`}>
        {pct}% sure
        {low && ". Low confidence, needs a closer look"}
      </p>
    </div>
  );
}

function describe(e: HistoryEntry): string {
  const who = e.confirmedBy ?? "a team member";
  const how =
    e.source === "override"
      ? `Set by ${who}`
      : e.source === "broker"
        ? "Verified by a broker"
        : e.confirmedAt
          ? `Suggested by the agent, confirmed by ${who}`
          : "Suggested by the agent";
  return `${how} · ${STATUS_LABELS[e.status]}`;
}

function History({ entries }: { entries: HistoryEntry[] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold">
        Earlier codes ({entries.length})
      </summary>
      <ol className="mt-2 flex flex-col gap-2">
        {entries.map((e) => (
          <li key={e.id} className="flex flex-col">
            <span>
              <span className="font-mono">
                {e.code ? formatHtsCode(e.code) : "No code"}
              </span>
            </span>
            <span className="text-muted text-xs">
              {describe(e)} · {day(e.confirmedAt ?? e.createdAt)}
            </span>
            {e.overrideReason && (
              <span className="text-xs">“{e.overrideReason}”</span>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
