/** Shipment-level fees: merchandise processing fee, harbor maintenance fee, carrier fees. */
import { Decimal, formatUsd, sum, usd } from "../money";
import type { AppliedProgram } from "./base-duty";
import { inForce, type Review } from "./shared";
import type { Component, Fee, FeeType, Shipment } from "./types";

const LABELS: Record<FeeType, string> = {
  mpf_formal: "Merchandise processing fee (formal entry)",
  mpf_informal: "Merchandise processing fee (informal entry)",
  hmf: "Harbor maintenance fee",
  carrier_brokerage: "Carrier brokerage fee",
  informal_entry_limit: "Informal entry limit",
};

export type FeeLine = { valueUsd: Decimal; program: AppliedProgram | null };
/** A fee and the weight of each line in its allocation (lines that do not pay it weigh zero). */
export type ChargedFee = { component: Component; weights: Decimal[] };

export function shipmentFees(
  lines: FeeLine[],
  shipment: Shipment,
  entryDate: string,
  allFees: Fee[],
  review: Review,
): { entryType: "formal" | "informal"; fees: ChargedFee[] } {
  const pick = (type: FeeType) =>
    pickFee(allFees, type, shipment, entryDate, review);
  const values = lines.map((l) => l.valueUsd);
  const total = sum(values);

  let entryType: "formal" | "informal" = "formal";
  const limit = pick("informal_entry_limit");
  if (!limit) {
    review.refuse(
      "No informal entry limit in force for this date and mode; treated as a formal entry.",
    );
  } else if (total.lte(limit.flatAmount!)) {
    entryType = "informal";
  }

  const fees: ChargedFee[] = [];
  const mpfType = entryType === "formal" ? "mpf_formal" : "mpf_informal";
  const mpf = pick(mpfType);
  if (mpf) fees.push(mpfFee(mpf, lines, review));
  else
    review.refuse(
      `No ${LABELS[mpfType].toLowerCase()} in force for this date and mode.`,
    );

  if (shipment.mode === "ocean") {
    const hmf = pick("hmf");
    if (hmf)
      fees.push({
        component: feeComponent("hmf", hmf, total),
        weights: values,
      });
    else review.refuse("No harbor maintenance fee in force for this date.");
  }

  const carrier = pick("carrier_brokerage");
  if (carrier) {
    fees.push({
      component: feeComponent("carrier_fee", carrier, total),
      weights: values,
    });
  } else if (shipment.carrier) {
    review.warn(
      `No brokerage fee on file for ${shipment.carrier}; none was added.`,
    );
  }

  return { entryType, fees };
}

/**
 * Goods that qualify for an MPF-exempt program (most free trade agreements) pay no MPF; the fee is
 * charged on the rest of the entry's value. A partly exempt entry goes to review so a person can
 * check the proration.
 */
function mpfFee(fee: Fee, lines: FeeLine[], review: Review): ChargedFee {
  for (const l of lines) {
    if (l.program && l.program.mpfExempt === null) {
      review.refuse(
        `Program ${l.program.symbol}: no data on whether its goods skip the merchandise processing fee; charged on the full value.`,
      );
    }
  }
  const weights = lines.map((l) =>
    l.program?.mpfExempt ? new Decimal(0) : l.valueUsd,
  );
  const dutiable = sum(weights);
  const exempt = sum(lines.map((l) => l.valueUsd)).minus(dutiable);
  if (exempt.isZero()) {
    return { component: feeComponent("mpf", fee, dutiable), weights };
  }
  if (dutiable.isZero()) {
    const component = feeComponent("mpf", fee, dutiable);
    return {
      component: {
        ...component,
        amount: "0.00",
        basis: "every line qualifies for an MPF-exempt program",
      },
      weights,
    };
  }
  review.refuse(
    `${formatUsd(exempt)} of this entry qualifies for an MPF-exempt program; the fee was charged on the other ${formatUsd(dutiable)}. Check the proration.`,
  );
  return { component: feeComponent("mpf", fee, dutiable), weights };
}

/**
 * The row in force on the entry date for this mode and carrier. A row for the exact carrier beats
 * a row for the mode, which beats a generic row; then the latest start date wins. Two equally good
 * rows are a data problem, so the shipment goes to review.
 */
function pickFee(
  fees: Fee[],
  type: FeeType,
  shipment: Shipment,
  on: string,
  review: Review,
): Fee | null {
  const carrier = shipment.carrier?.trim().toUpperCase();
  const candidates = fees.filter(
    (f) =>
      f.feeType === type &&
      inForce(f, on) &&
      (f.mode === null || f.mode === shipment.mode) &&
      (f.carrier === null || f.carrier.trim().toUpperCase() === carrier),
  );
  if (candidates.length === 0) return null;
  const rank = (f: Fee) =>
    (f.carrier !== null ? 2 : 0) + (f.mode !== null ? 1 : 0);
  candidates.sort(
    (a, b) =>
      rank(b) - rank(a) || b.effectiveFrom.localeCompare(a.effectiveFrom),
  );
  const [best, next] = candidates;
  if (
    next &&
    rank(next) === rank(best) &&
    next.effectiveFrom === best.effectiveFrom
  ) {
    review.refuse(
      `${LABELS[type]}: rows ${best.id} and ${next.id} both apply; fix the fee data.`,
    );
  }
  return best;
}

/** `flat + pct% × value`, clamped to the row's minimum and maximum. */
function feeComponent(
  kind: Component["kind"],
  fee: Fee,
  value: Decimal,
): Component {
  const pct = fee.pct === null ? null : new Decimal(fee.pct);
  const flat = fee.flatAmount === null ? null : new Decimal(fee.flatAmount);
  let amount = (flat ?? new Decimal(0)).plus(
    pct ? value.times(pct).dividedBy(100) : 0,
  );
  const parts: string[] = [];
  if (pct) parts.push(`${pct.toString()}% of ${formatUsd(value)}`);
  if (flat) parts.push(`${pct ? "plus " : ""}${formatUsd(flat)} flat`);
  if (fee.minAmount !== null && amount.lt(fee.minAmount)) {
    amount = new Decimal(fee.minAmount);
    parts.push(`minimum ${formatUsd(amount)}`);
  }
  if (fee.maxAmount !== null && amount.gt(fee.maxAmount)) {
    amount = new Decimal(fee.maxAmount);
    parts.push(`maximum ${formatUsd(amount)}`);
  }
  return {
    kind,
    label: LABELS[fee.feeType] + (fee.carrier ? ` (${fee.carrier})` : ""),
    basis: parts.join(", "),
    amount: usd(amount),
    source: {
      table: "fee_schedules",
      id: fee.id,
      effectiveFrom: fee.effectiveFrom,
      effectiveTo: fee.effectiveTo,
      sourceUrl: fee.sourceUrl,
    },
  };
}
