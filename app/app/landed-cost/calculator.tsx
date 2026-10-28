"use client";

import { useActionState, useState, useTransition } from "react";
import { CURRENCY_CODES } from "@/lib/catalog/currencies";
import { formatHtsCode } from "@/lib/catalog/listing";
import { MAX_QUOTE_LINES } from "@/lib/landed-cost/schema";
import { field, primary, secondary } from "@/lib/ui/styles";
import {
  calculateQuote,
  saveQuote,
  searchProducts,
  type CalcState,
  type ProductHit,
} from "./actions";
import { CostBreakdown } from "./cost-breakdown";

type CalcLine = {
  productId: string;
  title: string;
  sku: string | null;
  code: string;
  confirmed: boolean;
  storedCurrency: string | null;
  quantity: string;
  unitValue: string;
};

const MODE_LABELS: Record<string, string> = {
  postal: "Postal",
  express: "Express courier",
  air: "Air freight",
  ocean: "Ocean freight",
};
const idle: CalcState = { status: "idle" };

export function Calculator({
  defaults,
  countries,
  canSave,
}: {
  defaults: { origin: string; mode: string; entryDate: string };
  /** From the server: country names come from the runtime's Intl data, which browsers differ on. */
  countries: { code: string; name: string }[];
  canSave: boolean;
}) {
  const [lines, setLines] = useState<CalcLine[]>([]);
  const [origin, setOrigin] = useState(defaults.origin);
  const [mode, setMode] = useState(defaults.mode);
  const [entryDate, setEntryDate] = useState(defaults.entryDate);
  const [currency, setCurrency] = useState("USD");
  const [fxRate, setFxRate] = useState("1");
  const [carrier, setCarrier] = useState("");
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductHit[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [calc, calculate, pricing] = useActionState(calculateQuote, idle);
  const [saved, save, saving] = useActionState(saveQuote, idle);
  const [pricedPayload, setPricedPayload] = useState<string | null>(null);

  const payload = JSON.stringify({
    lines: lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      unitValue: l.unitValue,
    })),
    origin,
    mode,
    entryDate,
    currency,
    fxRateToUsd: currency === "USD" ? "1" : fxRate,
    carrier,
  });
  const errors =
    (calc.status === "error" ? calc.errors : undefined) ??
    (saved.status === "error" ? saved.errors : undefined) ??
    {};
  const priced = calc.status === "priced" ? calc.quote : null;
  const fresh = priced !== null && pricedPayload === payload;

  function add(hit: ProductHit) {
    if (!hit.code || lines.some((l) => l.productId === hit.id)) return;
    if (lines.length === 0) {
      if (hit.origin) setOrigin(hit.origin);
      if (hit.currency && hit.customsValue) {
        setCurrency(hit.currency);
        if (hit.currency === "USD") setFxRate("1");
      }
    }
    const quoteCurrency =
      lines.length === 0 && hit.customsValue ? hit.currency : currency;
    setLines((ls) => [
      ...ls,
      {
        productId: hit.id,
        title: hit.title,
        sku: hit.sku,
        code: hit.code!,
        confirmed:
          hit.status === "confirmed" || hit.status === "broker_verified",
        storedCurrency: hit.currency,
        quantity: "1",
        // The stored value only fills in when it is in the quote's currency.
        unitValue:
          hit.customsValue && hit.currency === quoteCurrency
            ? hit.customsValue
            : "",
      },
    ]);
  }
  const update = (i: number, patch: Partial<CalcLine>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="products-heading"
        className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4"
      >
        <h2 id="products-heading" className="text-base font-semibold">
          Products
        </h2>
        <form
          role="search"
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            startSearch(async () => setHits(await searchProducts(query)));
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="product-search" className="text-sm font-medium">
              Find products
            </label>
            <input
              id="product-search"
              type="search"
              value={query}
              maxLength={100}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Title, SKU or HTS code"
              className={`${field} w-72`}
            />
          </div>
          <button type="submit" className={secondary} disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </button>
        </form>
        {hits && (
          <ul aria-label="Search results" className="flex flex-col gap-1">
            {hits.length === 0 && (
              <li className="text-muted text-sm">No products match.</li>
            )}
            {hits.map((h) => {
              const added = lines.some((l) => l.productId === h.id);
              return (
                <li
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span>
                    {h.title}{" "}
                    <span className="text-muted font-mono text-xs">
                      {h.sku ?? ""} {h.code ? formatHtsCode(h.code) : ""}
                    </span>
                  </span>
                  {h.code ? (
                    <button
                      type="button"
                      className="text-brand text-xs underline disabled:no-underline disabled:opacity-60"
                      disabled={added || lines.length >= MAX_QUOTE_LINES}
                      onClick={() => add(h)}
                      aria-label={`Add ${h.title}`}
                    >
                      {added ? "Added" : "Add"}
                    </button>
                  ) : (
                    <span className="text-muted text-xs">
                      No code yet, so it can&apos;t be priced
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {lines.length === 0 ? (
          <p className="text-muted text-sm">
            Search your catalog and add the products in this shipment.
          </p>
        ) : (
          <ul
            aria-label="Products in this quote"
            className="flex flex-col gap-3"
          >
            {lines.map((l, i) => (
              <li
                key={l.productId}
                className="border-border flex flex-col gap-2 border-t pt-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{l.title}</span>
                  <span className="text-muted text-xs">
                    <span className="font-mono">{formatHtsCode(l.code)}</span>
                    {l.confirmed
                      ? " · Confirmed"
                      : " · Suggested, not confirmed"}
                  </span>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <LineField
                    id={`qty-${i}`}
                    label={`Quantity of ${l.title}`}
                    shortLabel="Quantity"
                    value={l.quantity}
                    error={errors[`lines.${i}.quantity`]}
                    onChange={(v) => update(i, { quantity: v })}
                    inputMode="numeric"
                  />
                  <LineField
                    id={`value-${i}`}
                    label={`Value per item of ${l.title}, in ${currency}`}
                    shortLabel={`Value per item (${currency})`}
                    value={l.unitValue}
                    error={errors[`lines.${i}.unitValue`]}
                    onChange={(v) => update(i, { unitValue: v })}
                    inputMode="decimal"
                  />
                  <button
                    type="button"
                    className="text-brand py-2 text-xs underline"
                    aria-label={`Remove ${l.title}`}
                    onClick={() =>
                      setLines((ls) => ls.filter((_, j) => j !== i))
                    }
                  >
                    Remove
                  </button>
                </div>
                {l.storedCurrency && l.storedCurrency !== currency && (
                  <p className="text-muted text-xs">
                    Its catalog value is in {l.storedCurrency}; enter it in{" "}
                    {currency} here.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {errors.lines && (
          <p role="alert" className="text-risk text-sm">
            {errors.lines}
          </p>
        )}
      </section>

      <form
        action={calculate}
        onSubmit={() => setPricedPayload(payload)}
        className="border-border bg-surface flex flex-col gap-4 rounded-lg border p-4"
        aria-labelledby="shipment-heading"
        noValidate
      >
        <h2 id="shipment-heading" className="text-base font-semibold">
          Shipment
        </h2>
        <input type="hidden" name="payload" value={payload} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id="origin"
            label="Country of origin"
            value={origin}
            onChange={setOrigin}
            error={errors.origin}
            options={[
              { value: "", label: "Choose…" },
              ...countries.map((c) => ({ value: c.code, label: c.name })),
            ]}
          />
          <Select
            id="mode"
            label="How it ships"
            value={mode}
            onChange={setMode}
            error={errors.mode}
            options={Object.entries(MODE_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <Text
            id="entryDate"
            label="Entry date"
            type="date"
            value={entryDate}
            onChange={setEntryDate}
            error={errors.entryDate}
            help="Rates in force on this date are used."
          />
          <Select
            id="currency"
            label="Currency of the values"
            value={currency}
            onChange={(v) => {
              setCurrency(v);
              if (v === "USD") setFxRate("1");
              else if (currency === "USD") setFxRate("");
            }}
            error={errors.currency}
            options={CURRENCY_CODES.map((c) => ({ value: c, label: c }))}
          />
          {currency !== "USD" && (
            <Text
              id="fxRateToUsd"
              label={`US dollars for 1 ${currency}`}
              value={fxRate}
              onChange={setFxRate}
              error={errors.fxRateToUsd}
              help="Use the rate your broker or bank gives for the entry date. ClearDuty never assumes one."
              inputMode="decimal"
            />
          )}
          <Text
            id="carrier"
            label="Carrier (optional)"
            value={carrier}
            onChange={setCarrier}
            error={errors.carrier}
            help="Adds its brokerage fee when we have one on file."
          />
        </div>
        {calc.status === "error" && (
          <p role="alert" className="text-risk text-sm">
            {calc.message}
          </p>
        )}
        <div>
          <button
            type="submit"
            disabled={pricing || lines.length === 0}
            className={fresh ? secondary : primary}
          >
            {pricing ? "Calculating…" : fresh ? "Calculate again" : "Calculate"}
          </button>
        </div>
      </form>

      {priced && !fresh && (
        <p className="text-review text-sm" role="status">
          You changed the quote since it was calculated. Calculate again to see
          the new figures.
        </p>
      )}
      {priced && fresh && (
        <>
          <CostBreakdown
            data={{
              status: priced.result.status,
              entryType: priced.result.entryType,
              currency: priced.input.currency,
              lines: priced.lines,
              shipmentFees: priced.result.shipmentFees,
              totals: priced.result.totals,
              warnings: priced.result.warnings,
              notices: priced.notices,
            }}
          />
          {canSave && (
            <form
              action={save}
              className="border-border bg-surface flex flex-wrap items-end gap-3 rounded-lg border p-4"
              aria-label="Save quote"
            >
              <input type="hidden" name="payload" value={payload} />
              <Text
                id="name"
                label="Quote name"
                value={name}
                onChange={setName}
                error={errors.name}
                help="For example, the order or supplier."
              />
              <button type="submit" disabled={saving} className={primary}>
                {saving ? "Saving…" : "Save quote"}
              </button>
              {saved.status === "error" && (
                <p role="alert" className="text-risk w-full text-sm">
                  {saved.message}
                </p>
              )}
            </form>
          )}
        </>
      )}
    </div>
  );
}

function LineField({
  id,
  label,
  shortLabel,
  value,
  error,
  onChange,
  inputMode,
}: {
  id: string;
  label: string;
  shortLabel: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  inputMode: "numeric" | "decimal";
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium">
        <span aria-hidden="true">{shortLabel}</span>
        <span className="sr-only">{label}</span>
      </label>
      <input
        id={id}
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${field} w-36`}
      />
      {error && (
        <span id={`${id}-error`} className="text-risk text-xs">
          {error}
        </span>
      )}
    </div>
  );
}

function Text({
  id,
  label,
  value,
  onChange,
  error,
  help,
  type = "text",
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  help?: string;
  type?: string;
  inputMode?: "decimal";
}) {
  const describedBy =
    [help ? `${id}-help` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id === "name" ? "name" : undefined}
        type={type}
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={field}
      />
      {help && (
        <p id={`${id}-help`} className="text-muted text-xs">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-risk text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        // Long country names must not set the page's minimum width on a phone.
        className={`${field} w-full min-w-0`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${id}-error`} className="text-risk text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
