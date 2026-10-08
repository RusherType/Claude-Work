"use client";

import { useActionState } from "react";
import { COUNTRIES } from "@/lib/countries";
import { createWorkspace, type ActionState } from "./workspace-actions";

const BUSINESS_TYPES = [
  { value: "dtc_to_us", label: "I sell to US shoppers from abroad" },
  { value: "importer", label: "I import inventory into the US" },
  { value: "both", label: "Both" },
];

const input =
  "border-border bg-surface focus-visible:ring-brand rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createWorkspace,
    {
      status: "idle",
    },
  );

  return (
    <form action={action} className="flex max-w-md flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Company name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={120}
          className={input}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="homeCountry" className="text-sm font-medium">
          Home country
        </label>
        <select
          id="homeCountry"
          name="homeCountry"
          required
          defaultValue=""
          className={input}
        >
          <option value="" disabled>
            Choose a country
          </option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">What do you do?</legend>
        {BUSINESS_TYPES.map((t) => (
          <label key={t.value} className="flex items-center gap-2 text-sm">
            <input type="radio" name="businessType" value={t.value} required />
            {t.label}
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
        className="bg-brand focus-visible:ring-brand dark:text-background self-start rounded-md px-4 py-2.5 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}
