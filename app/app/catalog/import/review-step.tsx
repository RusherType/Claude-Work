"use client";

import { problemsCsv, type CheckResult } from "@/lib/catalog/import";
import { primary, secondary } from "@/lib/ui/styles";
import type { FileData } from "./import-wizard";
import { StepHeading } from "./step-heading";
import { download } from "./upload-step";

const SHOWN_ERRORS = 50;

export function ReviewStep({
  file,
  result,
  onBack,
  onImport,
}: {
  file: FileData;
  result: CheckResult;
  onBack: () => void;
  onImport: () => void;
}) {
  const { checked, blank, merged } = result;
  const ready = checked.filter((c) => c.row).length;
  const failed = checked.filter((c) => !c.row);

  return (
    <div className="flex flex-col gap-4">
      <StepHeading step={3} title="Review and import" focus />
      <p className="text-sm" role="status">
        <span className="font-medium">{ready.toLocaleString()}</span> of{" "}
        {checked.length.toLocaleString()} products in {file.fileName} are ready
        to import.
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
      {(blank > 0 || merged > 0) && (
        <p className="text-muted text-sm">
          {blank > 0 && `${blank.toLocaleString()} blank rows ignored. `}
          {merged > 0 &&
            `${merged.toLocaleString()} image-only rows added to their product.`}
        </p>
      )}
      <p className="text-muted text-sm">
        Existing SKUs are updated; blank cells keep what is already saved.
        Changing a product&apos;s title, description, type, tags, images, value
        or weight marks a confirmed code Outdated so it is checked again.
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
                  "clearduty-rows-to-fix.csv",
                  problemsCsv(file.headers, failed),
                )
              }
            >
              Download rows to fix (CSV)
            </button>
            <span className="text-muted text-xs">
              Fix them and import that file; the problems column is ignored.
            </span>
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
