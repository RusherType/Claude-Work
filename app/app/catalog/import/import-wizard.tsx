"use client";

import { useState } from "react";
import { CsvError, parseCsv } from "@/lib/catalog/csv";
import {
  checkRows,
  guessMapping,
  MAX_FILE_BYTES,
  MAX_ROWS,
  planBatches,
  type CheckedRow,
  type Mapping,
  type ProductRow,
} from "@/lib/catalog/import";
import { importProductBatch } from "./actions";
import { MappingStep } from "./mapping-step";
import { ResultStep, ReviewStep } from "./review-step";
import { UploadStep } from "./upload-step";

// CD-022: upload -> map columns -> review per-row errors -> import in batches -> result.
// The file never leaves the browser except as checked rows sent in batches.

export type Totals = { inserted: number; updated: number; unchanged: number };
export type Progress = {
  done: number;
  total: number;
  totals: Totals;
  error: string | null;
  /** Batches still to send (kept so a failure can be retried from where it stopped). */
  remaining: ProductRow[][];
};

type State =
  | { step: "upload"; error: string | null }
  | {
      step: "map";
      fileName: string;
      headers: string[];
      rows: string[][];
      mapping: Mapping;
    }
  | {
      step: "review";
      fileName: string;
      headers: string[];
      rows: string[][];
      mapping: Mapping;
      checked: CheckedRow[];
    }
  | { step: "import"; checked: CheckedRow[]; progress: Progress };

const ZERO: Totals = { inserted: 0, updated: 0, unchanged: 0 };

export function ImportWizard({ workspaceId }: { workspaceId: string }) {
  const [state, setState] = useState<State>({ step: "upload", error: null });

  async function onFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      return setState({
        step: "upload",
        error: "This file is over 10 MB. Split it into smaller files.",
      });
    }
    let all: string[][];
    try {
      all = parseCsv(await file.text());
    } catch (e) {
      const message =
        e instanceof CsvError
          ? `We couldn't read this file. ${e.message}.`
          : "We couldn't read this file. Save it as CSV (UTF-8) and try again.";
      return setState({ step: "upload", error: message });
    }
    const [headers, ...rows] = all;
    if (!headers || rows.length === 0) {
      return setState({
        step: "upload",
        error:
          "This file has no product rows. The first line must be the column names.",
      });
    }
    if (rows.length > MAX_ROWS) {
      return setState({
        step: "upload",
        error: `This file has ${rows.length.toLocaleString()} rows; the limit is ${MAX_ROWS.toLocaleString()} per file. Split it and import each part.`,
      });
    }
    setState({
      step: "map",
      fileName: file.name,
      headers,
      rows,
      mapping: guessMapping(headers),
    });
  }

  async function send(checked: CheckedRow[], start: Progress) {
    let progress = start;
    setState({ step: "import", checked, progress });
    while (progress.remaining.length > 0) {
      const [batch, ...rest] = progress.remaining;
      let result;
      try {
        result = await importProductBatch({ workspaceId, rows: batch });
      } catch {
        result = {
          status: "error" as const,
          message: "We lost the connection. Check your network and retry.",
        };
      }
      if (result.status === "error") {
        progress = { ...progress, error: result.message };
        setState({ step: "import", checked, progress });
        return;
      }
      const { inserted, updated, unchanged } = result;
      progress = {
        ...progress,
        done: progress.done + batch.length,
        totals: {
          inserted: progress.totals.inserted + inserted,
          updated: progress.totals.updated + updated,
          unchanged: progress.totals.unchanged + unchanged,
        },
        remaining: rest,
        error: null,
      };
      setState({ step: "import", checked, progress });
    }
  }

  switch (state.step) {
    case "upload":
      return <UploadStep error={state.error} onFile={onFile} />;
    case "map":
      return (
        <MappingStep
          fileName={state.fileName}
          headers={state.headers}
          sample={state.rows[0]}
          mapping={state.mapping}
          onChange={(mapping) => setState({ ...state, mapping })}
          onBack={() => setState({ step: "upload", error: null })}
          onNext={() =>
            setState({
              ...state,
              step: "review",
              checked: checkRows(state.rows, state.mapping),
            })
          }
        />
      );
    case "review":
      return (
        <ReviewStep
          fileName={state.fileName}
          checked={state.checked}
          onBack={() => setState({ ...state, step: "map" })}
          onImport={() => {
            const ready = state.checked.flatMap((c) => (c.row ? [c.row] : []));
            void send(state.checked, {
              done: 0,
              total: ready.length,
              totals: ZERO,
              error: null,
              remaining: planBatches(ready),
            });
          }}
        />
      );
    case "import":
      return (
        <ResultStep
          progress={state.progress}
          skipped={state.checked.filter((c) => !c.row).length}
          onRetry={() =>
            void send(state.checked, { ...state.progress, error: null })
          }
          onRestart={() => setState({ step: "upload", error: null })}
        />
      );
  }
}
