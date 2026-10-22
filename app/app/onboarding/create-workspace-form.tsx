"use client";

import { useActionState } from "react";
import { createWorkspace, type FormState } from "../actions";

const field =
  "border-border bg-surface focus-visible:ring-brand w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";

const businessTypes = [
  { value: "dtc_to_us", label: "I sell to US shoppers", hint: "Shipping orders to US customers" },
  { value: "importer", label: "I import inventory", hint: "Bringing stock into the US" },
  { value: "both", label: "Both", hint: "" },
];

export function CreateWorkspaceForm({ countries }: { countries: { code: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createWorkspace, { status: "idle" });

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Company name
        </label>
        <input id="name" name="name" required maxLength={80} autoComplete="organization" className={field} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="homeCountry" className="text-sm font-medium">
          Home country
        </label>
        <select id="homeCountry" name="homeCountry" required defaultValue="" className={field}>
          <option value="" disabled>
            Choose a country
          </option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">How do you sell?</legend>
        {businessTypes.map((t) => (
          <label
            key={t.value}
            className="border-border bg-surface has-[:checked]:border-brand flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm"
          >
            <input type="radio" name="businessType" value={t.value} required className="accent-brand mt-0.5" />
            <span>
              <span className="font-medium">{t.label}</span>
              {t.hint && <span className="text-muted block text-xs">{t.hint}</span>}
            </span>
          </label>
        ))}
      </fieldset>

      {state.status === "error" && (
        <p role="alert" className="text-risk text-sm">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-brand focus-visible:ring-brand dark:text-background rounded-md px-4 py-2.5 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}
