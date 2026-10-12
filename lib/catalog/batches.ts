import { BATCH_SIZE, type ProductRow } from "./schema";

/**
 * Split checked rows into upload batches of at most `maxRows` rows and about `maxBytes` of JSON,
 * so each server action stays under the 1 MB request limit.
 */
export function planBatches(
  rows: ProductRow[],
  maxRows = BATCH_SIZE,
  maxBytes = 700_000,
): ProductRow[][] {
  const encoder = new TextEncoder();
  const batches: ProductRow[][] = [];
  let current: ProductRow[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = encoder.encode(JSON.stringify(row)).length + 1;
    if (
      current.length > 0 &&
      (current.length >= maxRows || bytes + size > maxBytes)
    ) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(row);
    bytes += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
