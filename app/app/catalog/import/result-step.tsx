"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { rowsCsv } from "@/lib/catalog/import";
import { primary, secondary } from "@/lib/ui/styles";
import type { FileData, Progress } from "./import-wizard";
import { download } from "./upload-step";

export function ResultStep({
  file,
  progress,
  skipped,
  onRetry,
  onRestart,
}: {
  file: FileData;
  progress: Progress;
  skipped: number;
  onRetry: () => void;
  onRestart: () => void;
}) {
  const { done, total, totals, error, remaining } = progress;
  const finished = remaining.length === 0;
  const percent = total === 0 ? 100 : Math.round((done / total) * 100);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-lg border p-6">
      <h2
        ref={heading}
        tabIndex={-1}
        className="text-base font-semibold focus:outline-none"
      >
        {finished ? "Import finished." : error ? "Import stopped" : "Importing"}
      </h2>
      <div className="flex flex-col gap-2">
        <p className="text-sm" role="status" aria-live="polite">
          {finished
            ? `${done.toLocaleString()} products imported.`
            : error
              ? `Stopped after ${done.toLocaleString()} of ${total.toLocaleString()} products.`
              : `${done.toLocaleString()} of ${total.toLocaleString()} products. Keep this page open.`}
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
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-risk text-sm">
            {error.message}
          </p>
          <div className="flex flex-wrap gap-3">
            {error.retryable && (
              <button type="button" onClick={onRetry} className={primary}>
                Retry the remaining {(total - done).toLocaleString()}
              </button>
            )}
            <button
              type="button"
              className={error.retryable ? secondary : primary}
              onClick={() =>
                download(
                  "clearduty-rows-not-imported.csv",
                  rowsCsv(file.headers, remaining.flat()),
                )
              }
            >
              Download rows not imported
            </button>
            <button type="button" onClick={onRestart} className={secondary}>
              Start over
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
