"use client";

import { useActionState } from "react";
import {
  acceptInvitation,
  type ActionState,
} from "../../app/workspace-actions";

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    acceptInvitation,
    {
      status: "idle",
    },
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
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
        {pending ? "Joining…" : "Accept invitation"}
      </button>
    </form>
  );
}
