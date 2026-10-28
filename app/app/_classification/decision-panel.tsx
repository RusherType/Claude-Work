"use client";

import { useActionState, useEffect, useRef, useState, type Ref } from "react";
import { field, primary, secondary } from "@/lib/ui/styles";
import { confirmCode, overrideCode, type DecisionState } from "./actions";

/** Where the decision was made: the queue (moves on to `nextId`) or the product page. */
export type Origin = { from: "review" | "product"; nextId?: string };

const idle: DecisionState = { status: "idle" };

/**
 * Confirm the suggested code, or use your own with a reason (CD-041). The confirm form has a
 * fixed id so the queue's A shortcut can submit it.
 */
export function DecisionPanel({
  productId,
  contentHash,
  current,
  canConfirm,
  canOverride,
  origin,
}: {
  productId: string;
  contentHash: string;
  current: { id: string; code: string | null; status: string } | null;
  canConfirm: boolean;
  /** False when only an owner or admin may replace the code (broker-verified). */
  canOverride: boolean;
  origin: Origin;
}) {
  const [confirmState, confirm, confirming] = useActionState(confirmCode, idle);
  const [overrideState, override, overriding] = useActionState(
    overrideCode,
    idle,
  );
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const overrideError = overrideState.status === "error" ? overrideState : null;
  // Opening the form moves focus into it; after a failed save, to the first field in error.
  useEffect(() => {
    if (!open) return;
    const invalid = document
      .getElementById("override-form")
      ?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid ?? codeInput.current)?.focus();
  }, [open, overrideError?.attempt]);

  const returnFields = (
    <>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="contentHash" value={contentHash} />
      <input type="hidden" name="from" value={origin.from} />
      {origin.nextId && (
        <input type="hidden" name="nextId" value={origin.nextId} />
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      {canConfirm && current?.code && (
        <form
          id="confirm-form"
          action={confirm}
          className="flex flex-col gap-2"
        >
          {returnFields}
          <input type="hidden" name="classificationId" value={current.id} />
          <input type="hidden" name="code" value={current.code} />
          <button type="submit" disabled={confirming} className={primary}>
            {confirming
              ? "Confirming…"
              : origin.from === "review"
                ? "Confirm and next"
                : "Confirm code"}
          </button>
          {confirmState.status === "error" && (
            <p role="alert" className="text-risk text-sm">
              {confirmState.message}
            </p>
          )}
        </form>
      )}

      {canOverride ? (
        <div>
          <button
            ref={toggle}
            type="button"
            className={secondary}
            aria-expanded={open}
            aria-controls="override-form"
            onClick={() => setOpen((o) => !o)}
          >
            {current?.code ? "Use a different code" : "Set a code yourself"}
          </button>
        </div>
      ) : (
        <p className="text-muted text-xs">
          A licensed broker verified this code. Only an owner or admin can
          replace it.
        </p>
      )}
      {canOverride && open && (
        <form
          id="override-form"
          key={overrideError?.attempt ?? 0}
          action={override}
          noValidate
          className="border-border flex flex-col gap-3 rounded-md border p-3"
        >
          {returnFields}
          <input type="hidden" name="expectedId" value={current?.id ?? ""} />
          <input
            type="hidden"
            name="expectedCode"
            value={current?.code ?? ""}
          />
          <input
            type="hidden"
            name="expectedStatus"
            value={current?.status ?? ""}
          />
          <OverrideField
            id="override-code"
            name="code"
            label="HTS code (10 digits)"
            help="For example 6109.10.0012."
            value={overrideError?.values?.code ?? ""}
            error={overrideError?.errors?.code}
            inputRef={codeInput}
          />
          <OverrideField
            id="override-reason"
            name="reason"
            label="Your reason"
            help="Kept with the code as your record, e.g. a broker's advice or a ruling."
            value={overrideError?.values?.reason ?? ""}
            error={overrideError?.errors?.reason}
            multiline
          />
          {overrideError && (
            <p role="alert" className="text-risk text-sm">
              {overrideError.message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={overriding} className={primary}>
              {overriding ? "Saving…" : "Save my code"}
            </button>
            <button
              type="button"
              className={secondary}
              onClick={() => {
                setOpen(false);
                toggle.current?.focus();
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function OverrideField({
  id,
  name,
  label,
  help,
  value,
  error,
  multiline,
  inputRef,
}: {
  inputRef?: Ref<HTMLInputElement>;
  id: string;
  name: string;
  label: string;
  help: string;
  value: string;
  error?: string;
  multiline?: boolean;
}) {
  const props = {
    id,
    name,
    defaultValue: value,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": `${id}-help${error ? ` ${id}-error` : ""}`,
    "aria-required": true,
    className: field,
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea {...props} rows={2} maxLength={500} />
      ) : (
        <input
          {...props}
          ref={inputRef}
          inputMode="decimal"
          autoComplete="off"
        />
      )}
      <p id={`${id}-help`} className="text-muted text-xs">
        {help}
      </p>
      {error && (
        <p id={`${id}-error`} className="text-risk text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
