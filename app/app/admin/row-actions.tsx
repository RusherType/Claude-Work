"use client";

import { useActionState } from "react";
import type { Entity } from "@/lib/admin/schemas";
import { field, primary, secondary } from "@/lib/ui/styles";
import { deleteDraft, endRow, publishRow, type EditState } from "./actions";

const idle: EditState = { status: "idle" };

function Hidden({ entity, id }: { entity: Entity; id: string }) {
  return (
    <>
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
    </>
  );
}

export function DraftActions({ entity, id }: { entity: Entity; id: string }) {
  const [published, publish, publishing] = useActionState(publishRow, idle);
  const [deleted, remove, removing] = useActionState(deleteDraft, idle);
  const error = [published, deleted].find((s) => s.status === "error");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        <form
          action={publish}
          onSubmit={(e) => {
            if (
              !confirm(
                "Publish this row? It applies to every customer from its start date and can't be edited afterwards.",
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <Hidden entity={entity} id={id} />
          <button type="submit" disabled={publishing} className={primary}>
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </form>
        <form action={remove}>
          <Hidden entity={entity} id={id} />
          <button type="submit" disabled={removing} className={secondary}>
            Delete draft
          </button>
        </form>
      </div>
      <p className="text-muted text-xs">Save your edits before publishing.</p>
      {error?.status === "error" && (
        <p role="alert" className="text-risk text-sm">
          {error.message}
        </p>
      )}
    </div>
  );
}

export function EndDateForm({
  entity,
  id,
  from,
}: {
  entity: Entity;
  id: string;
  from: string;
}) {
  const [state, action, pending] = useActionState(endRow, idle);
  return (
    <form
      action={action}
      className="border-border bg-surface flex flex-wrap items-end gap-3 rounded-lg border p-4"
    >
      <Hidden entity={entity} id={id} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="end-date" className="text-sm font-medium">
          End date (last day it applies)
        </label>
        <input
          id="end-date"
          name="effective_to"
          type="date"
          min={from}
          required
          className={field}
        />
      </div>
      <button type="submit" disabled={pending} className={secondary}>
        Set end date
      </button>
      <p className="text-muted w-full text-xs">
        An end date can be set once. To change a published row, end it and add a
        new one.
      </p>
      {state.status === "error" && (
        <p role="alert" className="text-risk w-full text-sm">
          {state.message}
        </p>
      )}
    </form>
  );
}
