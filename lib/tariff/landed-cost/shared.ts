/** Collects a line's or shipment's problems; any refusal sends it to review. */
export class Review {
  warnings: string[] = [];
  needsReview = false;
  warn(message: string) {
    this.warnings.push(message);
  }
  refuse(message: string) {
    this.warnings.push(message);
    this.needsReview = true;
  }
}

/** Effective dates are inclusive at both ends. ISO dates compare correctly as strings. */
export function inForce(
  row: { effectiveFrom: string; effectiveTo: string | null },
  on: string,
): boolean {
  return (
    row.effectiveFrom <= on &&
    (row.effectiveTo === null || on <= row.effectiveTo)
  );
}

/** "6109.10.00.12" -> "6109100012". */
export const digits = (code: string) => code.replace(/\D/g, "");

/** "A+" -> "A", "A*" -> "A". */
export const baseSymbol = (symbol: string) =>
  symbol.trim().toUpperCase().replace(/[+*]$/, "");
