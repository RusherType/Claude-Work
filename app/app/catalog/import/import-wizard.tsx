"use client";

import { useEffect, useState } from "react";
import { CsvError, decodeCsvFile, parseCsvRows } from "@/lib/catalog/csv";
import {
  checkRows,
  guessMapping,
  MAX_FILE_BYTES,
  MAX_ROWS,
  planBatches,
  shopifyColumns,
  type CheckedRow,
  type CheckResult,
  type Mapping,
} from "@/lib/catalog/import";
import { importProductBatch } from "./actions";
import { MappingStep } from "./mapping-step";
import { ResultStep } from "./result-step";
import { ReviewStep } from "./review-step";
import { UploadStep } from "./upload-step";

// CD-022: upload -> match columns -> review per-row problems -> import in batches -> result.
// The file never leaves the browser except as checked rows sent in batches.

export type FileData = {
  fileName: string;
  headers: string[];
  rows: ReturnType<typeof parseCsvRows>;
  encoding: "utf-8" | "windows-1252";
};
export type Totals = { inserted: number; updated: number; unchanged: number };
export type Progress = {
  done: number;
  total: number;
  totals: Totals;
  error: { message: string; retryable: boolean } | null;
  /** Batches still to send, kept so a failure can be retried or downloaded. */
  remaining: CheckedRow[][];
};

type State =
  | { step: "upload"; error: string | null }
  | { step: "map"; file: FileData; mapping: Mapping; currency: string }
  | {
      step: "review";
      file: FileData;
      mapping: Mapping;
      currency: string;
      result: CheckResult;
    }
  | { step: "import"; file: FileData; result: CheckResult; progress: Progress };

const ZERO: Totals = { inserted: 0, updated: 0, unchanged: 0 };

/** Read and parse the file, or return a message saying what to do. */
async function readFile(file: File): Promise<FileData | string> {
  if (file.size > MAX_FILE_BYTES) {
    return "This file is over 10 MB. Split it into smaller files.";
  }
  let decoded: ReturnType<typeof decodeCsvFile>;
  let all: ReturnType<typeof parseCsvRows>;
  try {
    decoded = decodeCsvFile(new Uint8Array(await file.arrayBuffer()));
    all = parseCsvRows(decoded.text);
  } catch (e) {
    return e instanceof CsvError
      ? `We couldn't read this file. ${e.message}.`
      : "We couldn't read this file. Save it as CSV UTF-8 and try again.";
  }
  const [header, ...rows] = all;
  if (!header || rows.length === 0) {
    return "This file has no product rows. The first line must be the column names.";
  }
  if (header.cells.length === 1 && header.cells[0].includes(";")) {
    return 'This file uses semicolons between columns. In Excel choose "CSV UTF-8 (Comma delimited)" and save again.';
  }
  if (rows.length > MAX_ROWS) {
    return `This file has ${rows.length.toLocaleString()} rows; the limit is ${MAX_ROWS.toLocaleString()} per file. Split it and import each part.`;
  }
  return {
    fileName: file.name,
    headers: header.cells,
    rows,
    encoding: decoded.encoding,
  };
}

/** Group the ready rows into upload batches (same order and sizes as planBatches). */
function batchesOf(checked: CheckedRow[]): CheckedRow[][] {
  const ready = checked.filter((c) => c.row);
  const sizes = planBatches(ready.map((c) => c.row!)).map((b) => b.length);
  let start = 0;
  return sizes.map((n) => ready.slice(start, (start += n)));
}

export function ImportWizard({ workspaceId }: { workspaceId: string }) {
  const [state, setState] = useState<State>({ step: "upload", error: null });
  // Move focus to the new step's heading after the first change, not on page load.
  const [moved, setMoved] = useState(false);
  const go = (next: State) => {
    setMoved(true);
    setState(next);
  };

  const importing =
    state.step === "import" &&
    state.progress.remaining.length > 0 &&
    !state.progress.error;
  useEffect(() => {
    if (!importing) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // older Safari
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [importing]);

  async function onFile(file: File) {
    const data = await readFile(file);
    if (typeof data === "string") return go({ step: "upload", error: data });
    go({
      step: "map",
      file: data,
      mapping: guessMapping(data.headers),
      currency: "USD",
    });
  }

  async function send(file: FileData, result: CheckResult, start: Progress) {
    let progress = start;
    setState({ step: "import", file, result, progress });
    while (progress.remaining.length > 0) {
      const [batch, ...rest] = progress.remaining;
      let outcome;
      try {
        outcome = await importProductBatch({
          workspaceId,
          rows: batch.map((c) => c.row),
        });
      } catch {
        outcome = {
          status: "error" as const,
          retryable: true,
          message: "We lost the connection. Check your network and retry.",
        };
      }
      if (outcome.status === "error") {
        progress = {
          ...progress,
          error: { message: outcome.message, retryable: outcome.retryable },
        };
        setState({ step: "import", file, result, progress });
        return;
      }
      progress = {
        ...progress,
        done: progress.done + batch.length,
        totals: {
          inserted: progress.totals.inserted + outcome.inserted,
          updated: progress.totals.updated + outcome.updated,
          unchanged: progress.totals.unchanged + outcome.unchanged,
        },
        remaining: rest,
        error: null,
      };
      setState({ step: "import", file, result, progress });
    }
  }

  switch (state.step) {
    case "upload":
      return <UploadStep error={state.error} onFile={onFile} focus={moved} />;
    case "map":
      return (
        <MappingStep
          file={state.file}
          mapping={state.mapping}
          currency={state.currency}
          onChange={(mapping, currency) =>
            setState({ ...state, mapping, currency })
          }
          onBack={() => go({ step: "upload", error: null })}
          onNext={() =>
            go({
              ...state,
              step: "review",
              result: checkRows(state.file.rows, state.mapping, {
                currency: state.currency,
                shopify: shopifyColumns(state.file.headers),
              }),
            })
          }
        />
      );
    case "review":
      return (
        <ReviewStep
          file={state.file}
          result={state.result}
          onBack={() => go({ ...state, step: "map" })}
          onImport={() => {
            setMoved(true);
            const remaining = batchesOf(state.result.checked);
            void send(state.file, state.result, {
              done: 0,
              total: remaining.reduce((n, b) => n + b.length, 0),
              totals: ZERO,
              error: null,
              remaining,
            });
          }}
        />
      );
    case "import":
      return (
        <ResultStep
          file={state.file}
          progress={state.progress}
          skipped={state.result.checked.filter((c) => !c.row).length}
          onRetry={() =>
            void send(state.file, state.result, {
              ...state.progress,
              error: null,
            })
          }
          onRestart={() => go({ step: "upload", error: null })}
        />
      );
  }
}
