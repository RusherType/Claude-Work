"use client";

import { useActionState, useState } from "react";
import {
  FORM_FIELDS,
  formValue,
  MODES,
  type FormField,
} from "@/lib/admin/fields";
import type { Entity } from "@/lib/admin/schemas";
import { field, primary } from "@/lib/ui/styles";
import { saveDraft, type EditState } from "./actions";

const idle: EditState = { status: "idle" };

export function ReferenceForm({
  entity,
  id,
  row,
}: {
  entity: Entity;
  id: string | null;
  row: Record<string, unknown> | null;
}) {
  const [state, action, pending] = useActionState(
    saveDraft.bind(null, entity, id),
    idle,
  );
  const errors = state.status === "error" ? (state.errors ?? {}) : {};

  return (
    <form
      action={action}
      className="border-border bg-surface flex flex-col gap-4 rounded-lg border p-6"
      noValidate
    >
      {FORM_FIELDS[entity].map((f) => (
        <Field key={f.name} f={f} row={row} error={errors[f.name]} />
      ))}
      {state.status === "error" && (
        <p role="alert" className="text-risk text-sm">
          {state.message}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Saving…" : "Save draft"}
        </button>
      </div>
    </form>
  );
}

function Field({
  f,
  row,
  error,
}: {
  f: FormField;
  row: Record<string, unknown> | null;
  error?: string;
}) {
  const id = `f-${f.name}`;
  const describedBy =
    [f.help ? `${id}-help` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  const common = {
    id,
    name: f.name,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  };
  const value = formValue(row, f.name);
  const label = (
    <label htmlFor={id} className="text-sm font-medium">
      {f.label}
      {f.required && (
        <>
          <span aria-hidden="true" className="text-risk">
            {" "}
            *
          </span>
          <span className="sr-only"> (required)</span>
        </>
      )}
    </label>
  );
  const help = f.help && (
    <p id={`${id}-help`} className="text-muted text-xs">
      {f.help}
    </p>
  );
  const err = error && (
    <p id={`${id}-error`} className="text-risk text-xs">
      {error}
    </p>
  );

  if (f.kind === "modes") {
    const selected = (row?.applies_to_modes as string[] | undefined) ?? MODES;
    return (
      <fieldset
        className="flex flex-col gap-1.5"
        aria-describedby={describedBy}
      >
        <legend className="text-sm font-medium">{f.label}</legend>
        <div className="flex flex-wrap gap-4">
          {MODES.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="applies_to_modes"
                value={m}
                defaultChecked={selected.includes(m)}
              />
              {m}
            </label>
          ))}
        </div>
        {err}
      </fieldset>
    );
  }
  if (f.kind === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name={f.name}
          defaultChecked={row?.[f.name] === true}
        />
        {f.label}
      </label>
    );
  }
  if (f.kind === "exempt") return <ExemptField row={row} error={err} />;

  return (
    <div className="flex flex-col gap-1.5">
      {label}
      {f.kind === "textarea" ? (
        <textarea
          {...common}
          defaultValue={value}
          rows={3}
          className={`${field} font-mono`}
        />
      ) : f.kind === "select" ? (
        <select
          {...common}
          defaultValue={value}
          className={`${field} max-w-sm`}
        >
          {f.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={f.kind === "date" ? "date" : f.kind === "url" ? "url" : "text"}
          defaultValue={value}
          placeholder={f.placeholder}
          className={`${field} max-w-xl`}
        />
      )}
      {help}
      {err}
    </div>
  );
}

/** null = nobody checked (lines claiming a program go to review); a list (maybe empty) = checked. */
function ExemptField({
  row,
  error,
}: {
  row: Record<string, unknown> | null;
  error: React.ReactNode;
}) {
  const stored = row?.exempt_programs as string[] | null | undefined;
  const [known, setKnown] = useState(Array.isArray(stored));
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium">Exempt programs</legend>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="exempt_known"
          checked={known}
          onChange={(e) => setKnown(e.target.checked)}
        />
        I checked which special programs are exempt from this measure
      </label>
      {known && (
        <>
          <label htmlFor="f-exempt_programs" className="text-sm">
            Exempt program symbols (blank if none)
          </label>
          <input
            id="f-exempt_programs"
            name="exempt_programs"
            defaultValue={(stored ?? []).join(" ")}
            placeholder="S S+"
            className={`${field} max-w-xs font-mono`}
          />
        </>
      )}
      <p className="text-muted text-xs">
        Until this is checked, lines that claim a program and fall under this
        measure go to review.
      </p>
      {error}
    </fieldset>
  );
}
