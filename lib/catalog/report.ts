import { toCsv } from "./csv";
import type { CheckedRow } from "./rows";

/**
 * The rows that could not be imported, with the file's own columns plus a "problems" column, so
 * the file can be fixed and imported again as it is (the extra column is ignored).
 */
export function problemsCsv(headers: string[], failed: CheckedRow[]): string {
  return toCsv([
    [...headers, "problems"],
    ...failed.map((c) => [
      ...headers.map((_, i) => c.cells[i] ?? ""),
      c.errors.map((e) => e.message).join("; "),
    ]),
  ]);
}

/** Rows that were checked but not yet sent (after an import stopped), in the file's columns. */
export function rowsCsv(headers: string[], rows: CheckedRow[]): string {
  return toCsv([
    headers,
    ...rows.map((c) => headers.map((_, i) => c.cells[i] ?? "")),
  ]);
}
