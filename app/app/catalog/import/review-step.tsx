"use client";

import Link from "next/link";
import { toCsv } from "@/lib/catalog/csv";
import type { CheckedRow } from "@/lib/catalog/import";
import { primary, secondary } from "@/lib/ui/styles";
import type { Progress } from "./import-wizard";
import { download } from "./upload-step";

const SHOWN_ERRORS = 50;

export function ReviewStep({
  fileName,
  checked,
  onBack,
  onImport,
}: {
  fileName: string;
  checked: CheckedRow[];
  onBack: () => void;
  onImport: () => void;
}) {
  const ready = checked.filter((c) => c.row).length;
  const failed = checked.filter((c) => !c.row);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" role="status">
        <span className="font-medium">{ready.toLocaleString()}</span> of{" "}
        {checked.length.toLocaleString()} rows in {fileName} are ready to
        import.
        {failed.length > 0 && (
          <>
            {" "}
            <span className="text-risk font-medium">
              {failed.length.toLocaleString()} have problems
            </span>{" "}
            and will be skipped.
          </>
        )}
      </p>
      <p className="text-muted text-sm">
        Existing SKUs are updated; blank cells keep what is already saved.
        Changing a product&apos;s title, description, type or tags marks a
        confirmed code Outdated so it is checked again.
      </p>

      {failed.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="border-border bg-surface overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <caption className="sr-only">Rows with problems</caption>
              <thead className="text-muted text-left text-xs">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Line
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Problem
                  </th>
                </tr>
              </thead>
              <tbody>
                {failed.slice(0, SHOWN_ERRORS).map((c) => (
                  <tr key={c.line} className="border-border border-t align-top">
                    <td className="px-4 py-2 font-mono text-xs">{c.line}</td>
                    <td className="px-4 py-2">
                      {c.errors.map((e) => e.message).join("; ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {failed.length > SHOWN_ERRORS && (
              <span className="text-muted">
                Showing the first {SHOWN_ERRORS} of{" "}
                {failed.length.toLocaleString()}.
              </span>
            )}
            <button
              type="button"
              className={secondary}
              onClick={() =>
                download(
                  "clearduty-import-problems.csv",
                  toCsv([
                    ["line", "problems"],
                    ...failed.map((c) => [
                      String(c.line),
                      c.errors.map((e) => e.message).join("; "),
                    ]),
                  ]),
                )
              }
            >
              Download problems (CSV)
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onImport}
          disabled={ready === 0}
          className={primary}
        >
          Import {ready.toLocaleString()} {ready === 1 ? "product" : "products"}
        </button>
        <button type="button" onClick={onBack} className={secondary}>
          Change columns
        </button>
      </div>
    </div>
  );
}

export function ResultStep({
  progress,
  skipped,
  onRetry,
  onRestart,
}: {
  progress: Progress;
  skipped: number;
  onRetry: () => void;
  onRestart: () => void;
}) {
  const { done, total, totals, error, remaining } = progress;
  const finished = remaining.length === 0;
  const percent = total === 0 ? 100 : Math.round((done / total) * 100);

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-lg border p-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm" role="status" aria-live="polite">
          {finished
            ? "Import finished."
            : error
              ? `Import stopped after ${done.toLocaleString()} of ${total.toLocaleString()} products.`
              : `Importing… ${done.toLocaleString()} of ${total.toLocaleString()} products`}
        </p>
        <div
          className="bg-border h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-label="Import progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <div
            className="bg-brand h-full transition-[width] motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-4 text-sm sm:max-w-md">
        {(
          [
            ["Added", totals.inserted],
            ["Updated", totals.updated],
            ["Unchanged", totals.unchanged],
          ] as const
        ).map(([label, n]) => (
          <div key={label}>
            <dt className="text-muted text-xs">{label}</dt>
            <dd
              className="font-mono text-lg"
              data-testid={`import-${label.toLowerCase()}`}
            >
              {n.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
      {skipped > 0 && (
        <p className="text-muted text-sm">
          {skipped.toLocaleString()} rows with problems were skipped.
        </p>
      )}

      {error && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-risk text-sm">
            {error}
          </p>
          <div>
            <button type="button" onClick={onRetry} className={primary}>
              Retry the remaining {(total - done).toLocaleString()}
            </button>
          </div>
        </div>
      )}

      {finished && (
        <div className="flex flex-wrap gap-3">
          <Link href="/app" className={primary}>
            Go to dashboard
          </Link>
          <button type="button" onClick={onRestart} className={secondary}>
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
