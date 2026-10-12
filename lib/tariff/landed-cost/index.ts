/**
 * Landed-cost engine (CD-050). A pure function: every rate, measure, fee and program comes in as
 * data with effective dates, and nothing is built in. Money is exact decimal (decimal.js); each
 * component is rounded half up to the cent before it is added. When the data does not say what to
 * do, the line or shipment is marked `needs_review` instead of guessing. Rules:
 * docs/02-architecture.md ("Landed-cost engine rules").
 */
import { allocate, cents, Decimal, sum, usd } from "../money";
import { baseDuty } from "./base-duty";
import { shipmentFees } from "./fees";
import { overlays } from "./overlays";
import { inForce, Review } from "./shared";
import type { LandedCostInput, LandedCostResult, LineResult } from "./types";
import { validateInput } from "./validate";

export type * from "./types";

export function landedCost(input: LandedCostInput): LandedCostResult {
  const { entryDate, fx } = validateInput(input);
  const { shipment } = input;
  const measures = input.measures.filter(
    (m) => inForce(m, entryDate) && m.appliesToModes.includes(shipment.mode),
  );
  const programs = (input.programs ?? []).filter((p) => inForce(p, entryDate));

  const lines = input.lines.map((line) => {
    const review = new Review();
    if (line.codeStatus !== "confirmed") {
      review.warn(
        `Uses a suggested code (${line.code}) that nobody has confirmed yet; the duty may change.`,
      );
    }
    const valueUsd = cents(new Decimal(line.value).times(fx));
    const base = baseDuty(line, valueUsd, shipment, programs, review);
    const components = [
      ...base.components,
      ...overlays(line, valueUsd, base.program, measures, review),
    ];
    const duty = sum(components.map((c) => new Decimal(c.amount)));
    return { line, valueUsd, program: base.program, components, duty, review };
  });

  const shipmentReview = new Review();
  const { entryType, fees } = shipmentFees(
    lines,
    shipment,
    entryDate,
    input.fees,
    shipmentReview,
  );
  const perLine = lines.map(() => new Decimal(0));
  for (const fee of fees) {
    allocate(new Decimal(fee.component.amount), fee.weights).forEach((a, i) => {
      perLine[i] = perLine[i].plus(a);
    });
  }

  const results: LineResult[] = lines.map((l, i) => ({
    id: l.line.id,
    status: l.review.needsReview ? "needs_review" : "ok",
    customsValueUsd: usd(l.valueUsd),
    components: l.components,
    dutyTotal: usd(l.duty),
    allocatedFees: usd(perLine[i]),
    landedCost: usd(l.valueUsd.plus(l.duty).plus(perLine[i])),
    warnings: l.review.warnings,
  }));
  const customsValue = sum(lines.map((l) => l.valueUsd));
  const duties = sum(lines.map((l) => l.duty));
  const feeTotal = sum(fees.map((f) => new Decimal(f.component.amount)));
  const needsReview =
    shipmentReview.needsReview ||
    results.some((r) => r.status === "needs_review");

  return {
    status: needsReview ? "needs_review" : "ok",
    entryType,
    lines: results,
    shipmentFees: fees.map((f) => f.component),
    totals: {
      customsValue: usd(customsValue),
      duties: usd(duties),
      fees: usd(feeTotal),
      landedCost: usd(customsValue.plus(duties).plus(feeTotal)),
    },
    warnings: shipmentReview.warnings,
  };
}
