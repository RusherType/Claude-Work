import { STATUS_LABELS, type CatalogStatus } from "@/lib/catalog/listing";

const STYLE: Record<CatalogStatus, string> = {
  unclassified: "border-border text-muted",
  queued: "border-border text-muted",
  needs_answer: "border-review text-review",
  in_review: "bg-review text-white dark:text-background border-review",
  suggested: "border-brand text-brand",
  confirmed: "border-confirmed text-confirmed",
  broker_verified: "border-confirmed text-confirmed",
  outdated: "border-risk text-risk",
};
const ICON: Partial<Record<CatalogStatus, string>> = {
  confirmed: "✓",
  broker_verified: "✓✓",
  outdated: "!",
  needs_answer: "?",
};

/** Status in words with an icon, never by colour alone (docs/04-frontend.md). */
export function StatusChip({ status }: { status: CatalogStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STYLE[status]}`}
    >
      {ICON[status] && <span aria-hidden="true">{ICON[status]}</span>}
      {STATUS_LABELS[status]}
    </span>
  );
}
