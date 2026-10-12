/** The line's own duty: General, Special (a claimed program) or Column 2. */
import { isCountryCode } from "@/lib/countries";
import { Decimal, formatUsd, usd } from "../money";
import type { ParsedRate, Unit } from "../rate";
import { baseSymbol, type Review } from "./shared";
import type { Component, CostLine, Program, Shipment, Source } from "./types";

export type AppliedProgram = {
  symbol: string;
  /** null when no program data says whether qualifying goods skip the MPF. */
  mpfExempt: boolean | null;
};

type BaseRate = {
  rate: ParsedRate;
  kind: "duty_general" | "duty_special" | "duty_column2";
  label: string;
  source: Source;
};

export function baseDuty(
  line: CostLine,
  valueUsd: Decimal,
  shipment: Shipment,
  programs: Program[],
  review: Review,
): { components: Component[]; program: AppliedProgram | null } {
  const chosen = chooseRate(line, shipment, programs, review);
  if (!chosen) return { components: [], program: null };
  const components = rateComponents(line, valueUsd, chosen.base, review);
  return { components, program: chosen.program };
}

function chooseRate(
  line: CostLine,
  shipment: Shipment,
  programs: Program[],
  review: Review,
): { base: BaseRate; program: AppliedProgram | null } | null {
  const general = {
    base: {
      rate: line.generalRate,
      kind: "duty_general",
      label: "General duty",
      source: { table: "tariff_lines", code: line.code, column: "general" },
    } satisfies BaseRate,
    program: null,
  };

  if (shipment.column2Countries.includes(line.origin)) {
    if (!line.column2Rate || line.column2Rate.type === "none") {
      review.refuse(
        `Origin ${line.origin} pays the Column 2 rate, but this line has no Column 2 rate.`,
      );
      return null;
    }
    if (line.claimedProgram) {
      review.warn(
        `Program ${line.claimedProgram} cannot be claimed for a Column 2 origin (${line.origin}).`,
      );
    }
    return {
      base: {
        rate: line.column2Rate,
        kind: "duty_column2",
        label: "Column 2 duty",
        source: { table: "tariff_lines", code: line.code, column: "column2" },
      },
      program: null,
    };
  }

  if (!line.claimedProgram?.trim()) return general;
  const claimed = baseSymbol(line.claimedProgram);

  for (const group of line.specialRates ?? []) {
    const listed = group.programs.find((p) => baseSymbol(p) === claimed);
    if (!listed) continue;
    const mpfExempt = eligibility(listed.toUpperCase(), line, programs, review);
    if (mpfExempt === undefined) return general;
    return {
      base: {
        rate: group.rate,
        kind: "duty_special",
        label: `Special duty (${listed})`,
        source: {
          table: "tariff_lines",
          code: line.code,
          column: "special",
          program: listed,
        },
      },
      program: { symbol: listed, mpfExempt },
    };
  }
  // Not in the Special column (often because the General rate is already Free). The General rate
  // applies, but a qualifying claim still matters for overlay and MPF exemptions.
  review.warn(
    `Program ${claimed} is not listed for this line; the general rate is used.`,
  );
  const symbol = line.claimedProgram.trim().toUpperCase();
  const mpfExempt = eligibility(symbol, line, programs, review);
  if (mpfExempt === undefined) return general;
  return { ...general, program: { symbol, mpfExempt } };
}

/**
 * Whether the origin may use the program as listed on this line. Returns the program's MPF
 * exemption (null if unknown), or undefined after refusing, in which case the General rate is used.
 *
 * - "A*": some countries are excluded for this line only; that list is not in our data.
 * - With program data in force for the symbol, the origin must be one of its countries.
 * - Without data, a two-letter symbol that is a country code (AU, KR, JO, ...) is a bilateral
 *   agreement with that country; anything else (A, A+, S, P, ...) is refused.
 */
function eligibility(
  listed: string,
  line: CostLine,
  programs: Program[],
  review: Review,
): boolean | null | undefined {
  const general = "The general rate is used.";
  if (listed.endsWith("*")) {
    review.refuse(
      `Program ${listed} excludes some origins on this line; check that ${line.origin} qualifies. ${general}`,
    );
    return undefined;
  }
  const rows = programs.filter((p) => p.symbol === listed);
  if (rows.length > 1) {
    review.refuse(
      `Program ${listed} has more than one row in force. ${general}`,
    );
    return undefined;
  }
  if (rows.length === 1) {
    if (rows[0].countries.includes(line.origin)) return rows[0].mpfExempt;
    review.refuse(
      `Origin ${line.origin} does not qualify for program ${listed}. ${general}`,
    );
    return undefined;
  }
  if (/^[A-Z]{2}$/.test(listed) && isCountryCode(listed)) {
    if (listed === line.origin) return null;
    review.refuse(
      `Program ${listed} is for goods from ${listed}, not ${line.origin}. ${general}`,
    );
    return undefined;
  }
  review.refuse(
    `No eligibility data for program ${listed}, so it cannot be checked for ${line.origin}. ${general}`,
  );
  return undefined;
}

function rateComponents(
  line: CostLine,
  valueUsd: Decimal,
  base: BaseRate,
  review: Review,
): Component[] {
  const { rate } = base;
  const component = (
    label: string,
    basis: string,
    amount: Decimal,
  ): Component => ({
    kind: base.kind,
    label,
    basis,
    amount: usd(amount),
    source: base.source,
  });

  switch (rate.type) {
    case "none":
      review.refuse(
        `${base.label}: no rate on this line. Check the code is a full 10-digit line.`,
      );
      return [];
    case "complex":
      review.refuse(
        `${base.label}: the rate "${rate.raw}" needs a person to work out; no duty computed.`,
      );
      return [];
    case "free":
      return [component(`${base.label} Free`, "Free", new Decimal(0))];
  }

  const out: Component[] = [];
  for (const c of rate.components) {
    if (c.kind === "ad_valorem") {
      out.push(
        component(
          `${base.label} ${c.percent}%`,
          `${c.percent}% of ${formatUsd(valueUsd)}`,
          valueUsd.times(c.percent).dividedBy(100),
        ),
      );
      continue;
    }
    const qty = quantityIn(line, c.unit);
    if (qty === null) {
      review.refuse(
        `${base.label}: the rate is per ${c.unit}, so the line needs a quantity in ${c.unit}.`,
      );
      return [];
    }
    out.push(
      component(
        `${base.label} $${c.usd}/${c.unit}`,
        `$${c.usd} × ${qty.toString()} ${c.unit}`,
        new Decimal(c.usd).times(qty),
      ),
    );
  }
  if (rate.basis) {
    review.warn(
      `${base.label} is charged ${rate.basis}; check the quantity given is measured that way.`,
    );
  }
  return out;
}

function quantityIn(line: CostLine, unit: Unit): Decimal | null {
  const given = line.quantities?.[unit];
  if (given !== undefined) return new Decimal(given);
  return unit === "each" ? new Decimal(line.quantity) : null;
}
