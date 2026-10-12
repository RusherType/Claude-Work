import type { RowStatus } from "@/lib/admin/fields";

const STYLE: Record<RowStatus, string> = {
  Draft: "border-review text-review",
  Published: "border-confirmed text-confirmed",
  Ended: "border-border text-muted",
};

/** Status in words, never by colour alone. */
export function StatusBadge({ status }: { status: RowStatus }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STYLE[status]}`}
    >
      {status}
    </span>
  );
}
