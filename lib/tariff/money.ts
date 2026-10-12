/**
 * Exact decimal helpers for the landed-cost engine. Amounts enter and leave as strings; nothing
 * here touches binary floats.
 */
import DecimalJs from "decimal.js";

// A private clone so the app's global Decimal settings can never change our rounding.
export const Decimal = DecimalJs.clone({
  precision: 40,
  rounding: DecimalJs.ROUND_HALF_UP,
});
export type Decimal = InstanceType<typeof Decimal>;

const DECIMAL = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse a non-negative plain decimal string ("1000.00"). Throws, naming `what`, otherwise. */
export function dec(value: unknown, what: string): Decimal {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    throw new Error(`Invalid ${what}: ${JSON.stringify(value)}`);
  }
  return new Decimal(value);
}

/** Parse an optional decimal: null and undefined stay null. */
export function decOrNull(value: unknown, what: string): Decimal | null {
  return value == null ? null : dec(value, what);
}

/** Throw unless `value` is a real calendar date written YYYY-MM-DD. */
export function isoDate(value: unknown, what: string): string {
  const m = typeof value === "string" ? ISO_DATE.exec(value) : null;
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (
      d.getUTCFullYear() === +m[1] &&
      d.getUTCMonth() === +m[2] - 1 &&
      d.getUTCDate() === +m[3]
    ) {
      return value as string;
    }
  }
  throw new Error(`Invalid ${what}: ${JSON.stringify(value)}`);
}

/** Round half up to whole cents. */
export function cents(d: Decimal): Decimal {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** "1234.5" -> "1234.50". */
export function usd(d: Decimal): string {
  return cents(d).toFixed(2);
}

/** "1234.5" -> "$1,234.50", for human-readable bases. */
export function formatUsd(d: Decimal): string {
  const [int, frac] = usd(d).split(".");
  return `$${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}

export function sum(values: Decimal[]): Decimal {
  return values.reduce((a, b) => a.plus(b), new Decimal(0));
}

/**
 * Split `total` (already in whole cents) across `weights` so the parts add up to the total exactly.
 * Largest-remainder method: everyone gets the floor of their share, and the leftover cents go to
 * the largest fractional parts, ties to the earliest entry. All-zero weights split evenly.
 */
export function allocate(total: Decimal, weights: Decimal[]): Decimal[] {
  if (weights.length === 0) return [];
  const totalCents = total.times(100);
  const w = weights.every((x) => x.isZero())
    ? weights.map(() => new Decimal(1))
    : weights;
  const weightSum = sum(w);
  const exact = w.map((x) => totalCents.times(x).dividedBy(weightSum));
  const parts = exact.map((x) => x.floor());
  let left = totalCents.minus(sum(parts)).toNumber();
  const order = exact
    .map((x, i) => ({ i, frac: x.minus(x.floor()) }))
    .sort((a, b) => b.frac.comparedTo(a.frac) || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] = parts[i].plus(1);
    left -= 1;
  }
  return parts.map((p) => p.dividedBy(100));
}
