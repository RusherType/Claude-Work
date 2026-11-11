"use client";

import { useActionState } from "react";
import { secondary } from "@/lib/ui/styles";
import { deleteQuote, type CalcState } from "../../actions";

const idle: CalcState = { status: "idle" };

/** Delete this quote, after a confirmation (owners and admins only; the database checks). */
export function DeleteQuote({
  quoteId,
  name,
}: {
  quoteId: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(deleteQuote, idle);
  return (
    <form
      action={action}
      className="flex flex-col items-end gap-1"
      onSubmit={(e) => {
        if (
          !window.confirm(`Delete the quote “${name}”? This can't be undone.`)
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="quoteId" value={quoteId} />
      <button type="submit" disabled={pending} className={secondary}>
        {pending ? "Deleting…" : "Delete quote"}
      </button>
      {state.status === "error" && (
        <p role="alert" className="text-risk text-xs">
          {state.message}
        </p>
      )}
    </form>
  );
}
