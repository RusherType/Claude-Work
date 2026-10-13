"use client";

import { useActionState, useState } from "react";
import { CURRENCY_CODES } from "@/lib/catalog/currencies";
import { MAX_MATERIALS } from "@/lib/catalog/facts";
import { field, primary, secondary } from "@/lib/ui/styles";
import { saveProduct, type SaveState } from "./actions";

export type ProductValues = {
  title: string;
  description: string;
  product_type: string;
  vendor: string;
  tags: string;
  image_urls: string;
  origin_country: string;
  customs_value: string;
  currency: string;
  weight_kg: string;
  function: string;
  user: string;
  form: string;
  materials: { name: string; percent: string }[];
};

const idle: SaveState = { status: "idle" };

/** After a failed save, the submitted text; otherwise what is stored. */
function shownValues(stored: ProductValues, state: SaveState): ProductValues {
  if (state.status !== "error" || !state.values) return stored;
  const v = state.values;
  const materials = Array.from({ length: MAX_MATERIALS }, (_, i) => ({
    name: v[`material_${i}_name`] ?? "",
    percent: v[`material_${i}_percent`] ?? "",
  })).filter((m) => m.name || m.percent);
  return {
    title: v.title ?? "",
    description: v.description ?? "",
    product_type: v.product_type ?? "",
    vendor: v.vendor ?? "",
    tags: v.tags ?? "",
    image_urls: v.image_urls ?? "",
    origin_country: v.origin_country ?? "",
    customs_value: v.customs_value ?? "",
    currency: v.currency ?? "USD",
    weight_kg: v.weight_kg ?? "",
    function: v.function ?? "",
    user: v.user ?? "",
    form: v.form ?? "",
    materials,
  };
}

export function ProductForm({
  productId,
  version,
  values,
  confirmed,
  synced,
}: {
  productId: string;
  version: string;
  values: ProductValues;
  confirmed: boolean;
  synced: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveProduct.bind(null, productId, version),
    idle,
  );
  const shown = shownValues(values, state);
  const errors = state.status === "error" ? (state.errors ?? {}) : {};

  return (
    <form
      key={state.status === "error" ? (state.attempt ?? 0) : 0}
      action={action}
      noValidate
      className="border-border bg-surface flex flex-col gap-4 rounded-lg border p-4"
    >
      {synced && (
        <p className="text-muted text-sm">
          This product comes from your store. The next store sync may replace
          the title, description, type, tags and images; the facts you add here
          are kept.
        </p>
      )}
      <Text
        name="title"
        label="Title"
        required
        value={shown.title}
        error={errors.title}
      />
      <Text
        name="description"
        label="Description"
        value={shown.description}
        error={errors.description}
        multiline
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Text
          name="product_type"
          label="Product type"
          value={shown.product_type}
          error={errors.product_type}
        />
        <Text
          name="vendor"
          label="Vendor"
          value={shown.vendor}
          error={errors.vendor}
        />
      </div>
      <Text
        name="tags"
        label="Tags"
        help="Separated by commas."
        value={shown.tags}
        error={errors.tags}
      />
      <Text
        name="image_urls"
        label="Image links"
        help="https links, one per line (at most 20)."
        value={shown.image_urls}
        error={errors.image_urls}
        multiline
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Text
          name="origin_country"
          label="Country of origin"
          help="Two-letter code, e.g. CN."
          value={shown.origin_country}
          error={errors.origin_country}
        />
        <Text
          name="customs_value"
          label="Customs value"
          help="Per unit, e.g. 4.20."
          value={shown.customs_value}
          error={errors.customs_value ?? errors.currency}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="p-currency" className="text-sm font-medium">
            Currency
          </label>
          <select
            id="p-currency"
            name="currency"
            defaultValue={shown.currency}
            className={field}
          >
            {CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Text
        name="weight_kg"
        label="Weight (kg)"
        help="Net weight per unit."
        value={shown.weight_kg}
        error={errors.weight_kg}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-base font-semibold">
          Facts for classification
        </legend>
        <Materials initial={shown.materials} errors={errors} />
        <Text
          name="function"
          label="What it does"
          help='For example "worn as a T-shirt" or "holds hot drinks".'
          value={shown.function}
          error={errors.function}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Text
            name="user"
            label="Who uses it"
            help="Men, women, children, unisex…"
            value={shown.user}
            error={errors.user}
          />
          <Text
            name="form"
            label="How it's made"
            help="Knitted, woven, moulded, a set…"
            value={shown.form}
            error={errors.form}
          />
        </div>
      </fieldset>

      {confirmed && (
        <p className="text-review text-sm">
          This product has a confirmed code. Changing its title, description,
          type, tags, images, value, weight or facts marks the code Outdated so
          it is checked again.
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-risk text-sm">
          {state.message}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Text({
  name,
  label,
  value,
  error,
  help,
  required,
  multiline,
}: {
  name: string;
  label: string;
  value: string;
  error?: string;
  help?: string;
  required?: boolean;
  multiline?: boolean;
}) {
  const id = `p-${name}`;
  const describedBy =
    [help ? `${id}-help` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  const common = {
    id,
    name,
    defaultValue: value,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    "aria-required": required || undefined,
    className: field,
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="text-risk">
              {" "}
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
      {multiline ? (
        <textarea {...common} rows={3} />
      ) : (
        <input {...common} type="text" />
      )}
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

/** Up to MAX_MATERIALS rows of material and share; rows can be added and removed. */
function Materials({
  initial,
  errors,
}: {
  initial: { name: string; percent: string }[];
  errors: Record<string, string>;
}) {
  // Stable keys: inputs are uncontrolled, so a row must keep its own DOM when another is removed.
  const [rows, setRows] = useState(() =>
    (initial.length ? initial : [{ name: "", percent: "" }]).map((m, i) => ({
      ...m,
      key: i,
    })),
  );
  const [nextKey, setNextKey] = useState(MAX_MATERIALS + 1);
  return (
    <div
      className="flex flex-col gap-2"
      role="group"
      aria-labelledby="materials-label"
      aria-describedby={errors.materials ? "materials-error" : undefined}
    >
      <p className="text-sm font-medium" id="materials-label">
        Materials
      </p>
      {errors.materials && (
        <p id="materials-error" className="text-risk text-xs">
          {errors.materials}
        </p>
      )}
      {rows.map((m, i) => {
        const nameError = errors[`material_${i}_name`];
        const pctError = errors[`material_${i}_percent`];
        return (
          <div key={m.key} className="flex flex-wrap items-start gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`m-${i}-name`} className="sr-only">
                Material {i + 1}
              </label>
              <input
                id={`m-${i}-name`}
                name={`material_${i}_name`}
                defaultValue={m.name}
                placeholder="Cotton"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? `m-${i}-name-error` : undefined}
                className={`${field} w-48`}
              />
              {nameError && (
                <span id={`m-${i}-name-error`} className="text-risk text-xs">
                  {nameError}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`m-${i}-pct`} className="sr-only">
                Material {i + 1} share in percent
              </label>
              <input
                id={`m-${i}-pct`}
                name={`material_${i}_percent`}
                defaultValue={m.percent}
                placeholder="%"
                inputMode="decimal"
                aria-invalid={pctError ? true : undefined}
                aria-describedby={pctError ? `m-${i}-pct-error` : undefined}
                className={`${field} w-20`}
              />
              {pctError && (
                <span id={`m-${i}-pct-error`} className="text-risk text-xs">
                  {pctError}
                </span>
              )}
            </div>
            <button
              type="button"
              className="text-brand py-2 text-xs underline"
              aria-label={`Remove material ${i + 1}`}
              onClick={() =>
                setRows((r) => r.filter((row) => row.key !== m.key))
              }
            >
              Remove
            </button>
          </div>
        );
      })}
      {rows.length < MAX_MATERIALS && (
        <div>
          <button
            type="button"
            className={secondary}
            onClick={() => {
              setRows((r) => [...r, { name: "", percent: "", key: nextKey }]);
              setNextKey((k) => k + 1);
            }}
          >
            Add material
          </button>
        </div>
      )}
    </div>
  );
}
