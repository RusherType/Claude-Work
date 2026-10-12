/** Chapter 99 overlays (Sections 232, 301, 338 and the like): every covering measure stacks. */
import { Decimal, formatUsd, usd } from "../money";
import type { AppliedProgram } from "./base-duty";
import { baseSymbol, digits, type Review } from "./shared";
import type { Component, CostLine, Measure } from "./types";

/** `measures` are already filtered to the entry date and shipment mode. */
export function overlays(
  line: CostLine,
  valueUsd: Decimal,
  program: AppliedProgram | null,
  measures: Measure[],
  review: Review,
): Component[] {
  const code = digits(line.code);
  const out: Component[] = [];
  for (const m of measures) {
    if (!covers(m, code, line.origin)) continue;
    const name = m.ch99Code ? `${m.authority} (${m.ch99Code})` : m.authority;
    if (program) {
      if (m.exemptPrograms === undefined) {
        review.refuse(
          `${name}: nobody has recorded whether program ${program.symbol} goods are exempt; it was charged.`,
        );
      } else if (m.exemptPrograms.some((p) => exempts(p, program.symbol))) {
        continue;
      }
    }
    const component = overlayComponent(m, name, line, valueUsd, review);
    if (component) out.push(component);
  }
  return out;
}

/** "S" exempts S, S+ and S* claims; "S+" exempts only S+. */
function exempts(listed: string, claimed: string): boolean {
  const l = listed.trim().toUpperCase();
  const c = claimed.trim().toUpperCase();
  return l === c || (!/[+*]$/.test(l) && baseSymbol(c) === l);
}

function covers(m: Measure, code: string, origin: string): boolean {
  const originOk =
    m.originCountries.includes("**") || m.originCountries.includes(origin);
  const prefixOk = m.htsPrefixes.some((p) => code.startsWith(digits(p)));
  const excluded = m.excludedPrefixes.some((p) => code.startsWith(digits(p)));
  return originOk && prefixOk && !excluded;
}

function overlayComponent(
  m: Measure,
  name: string,
  line: CostLine,
  valueUsd: Decimal,
  review: Review,
): Component | null {
  let amount: Decimal;
  let basis: string;
  if (m.rateType === "ad_valorem") {
    amount = valueUsd.times(m.rateValue).dividedBy(100);
    basis = `${m.rateValue}% of ${formatUsd(valueUsd)}`;
  } else if (m.rateType === "flat_per_item") {
    amount = new Decimal(m.rateValue).times(line.quantity);
    basis = `$${m.rateValue} × ${line.quantity} items`;
  } else {
    // A specific measure has no unit in the data, so the engine cannot know what to multiply.
    review.refuse(`${name} is a specific rate with no unit; it was not added.`);
    return null;
  }
  return {
    kind: "overlay",
    label: name,
    basis,
    amount: usd(amount),
    source: {
      table: "tariff_measures",
      id: m.id,
      effectiveFrom: m.effectiveFrom,
      effectiveTo: m.effectiveTo,
      sourceUrl: m.sourceUrl,
    },
  };
}
