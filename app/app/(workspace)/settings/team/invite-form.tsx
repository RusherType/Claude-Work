"use client";

import { useActionState, useState } from "react";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { inviteMember, type InviteState } from "./actions";

const field =
  "border-border bg-background focus-visible:ring-brand rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";

export function InviteForm({
  workspaceId,
  roles,
}: {
  workspaceId: string;
  roles: Role[];
}) {
  const [state, action, pending] = useActionState<InviteState, FormData>(
    inviteMember,
    { status: "idle" },
  );
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-3 flex flex-col gap-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <label htmlFor="invite-email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-role" className="text-sm font-medium">
            Role
          </label>
          <select
            id="invite-role"
            name="role"
            defaultValue="member"
            className={field}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="bg-brand focus-visible:ring-brand dark:text-background rounded-md px-4 py-2 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
        >
          {pending ? "Inviting…" : "Send invite"}
        </button>
      </form>

      {state.status === "error" && (
        <p role="alert" className="text-risk text-sm">
          {state.message}
        </p>
      )}
      {state.status === "created" && (
        <div
          role="status"
          className="border-border rounded-md border p-3 text-sm"
        >
          <p>
            {state.emailed
              ? `Invite emailed to ${state.email}. You can also share this link:`
              : `Invite created for ${state.email}. Email isn't set up yet, so send them this link:`}
          </p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={state.link}
              aria-label="Invite link"
              className={`${field} min-w-0 flex-1 font-mono text-xs`}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(state.link);
                setCopied(true);
              }}
              className="border-border rounded-md border px-3 py-2 text-sm"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-muted mt-2 text-xs">
            The link works once, for {state.email} only, for 7 days.
          </p>
        </div>
      )}
    </div>
  );
}
