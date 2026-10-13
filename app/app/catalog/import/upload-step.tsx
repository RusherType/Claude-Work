"use client";

import { useState } from "react";
import { toCsv } from "@/lib/catalog/csv";
import {
  FIELD_INFO,
  FIELDS,
  MAX_ROWS,
  templateRows,
} from "@/lib/catalog/import";
import { download } from "@/lib/ui/download";
import { primary, secondary } from "@/lib/ui/styles";
import { StepHeading } from "./step-heading";

export function UploadStep({
  error,
  onFile,
  focus,
}: {
  error: string | null;
  onFile: (file: File) => Promise<void>;
  focus: boolean;
}) {
  const [reading, setReading] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <StepHeading step={1} title="Choose a file" focus={focus} />
      <form
        className="border-border bg-surface flex flex-col gap-4 rounded-lg border p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const file = new FormData(e.currentTarget).get("file");
          if (!(file instanceof File) || file.size === 0) return;
          setReading(true);
          await onFile(file);
          setReading(false);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="csv-file" className="text-sm font-medium">
            CSV file
          </label>
          <input
            id="csv-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            aria-describedby="csv-help"
            className="text-sm file:mr-3 file:rounded-md file:border file:border-[var(--border)] file:bg-transparent file:px-3 file:py-1.5"
          />
          <p id="csv-help" className="text-muted text-xs">
            Up to {MAX_ROWS.toLocaleString()} rows and 10 MB. The first line
            holds the column names. A Shopify product export works too: each
            variant becomes a product.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-risk text-sm">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={reading} className={primary}>
            {reading ? "Reading file…" : "Continue"}
          </button>
          <button
            type="button"
            className={secondary}
            onClick={() =>
              download("clearduty-products-template.csv", toCsv(templateRows()))
            }
          >
            Download template
          </button>
        </div>
      </form>

      <section aria-labelledby="columns-heading" className="text-sm">
        <h2 id="columns-heading" className="font-medium">
          Columns we read
        </h2>
        <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
          {FIELDS.map((f) => (
            <div key={f} className="contents">
              <dt className="font-mono text-xs">
                {f}
                {FIELD_INFO[f].required && (
                  <span className="text-risk"> (required)</span>
                )}
              </dt>
              <dd className="text-muted">{FIELD_INFO[f].help}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
