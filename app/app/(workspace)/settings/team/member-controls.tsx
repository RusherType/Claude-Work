"use client";

import { useState, useTransition } from "react";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { changeRole, removeMember, revokeInvite, type ActionResult } from "./actions";

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const result = await fn();
      setError(result.ok ? null : result.message);
    });
  return { pending, error, run };
}

export function MemberControls({
  workspaceId,
  userId,
  label,
  role,
  roles,
}: {
  workspaceId: string;
  userId: string;
  label: string;
  role: Role;
  roles: Role[];
}) {
  const { pending, error, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`role-${userId}`}>
        Role for {label}
      </label>
      <select
        id={`role-${userId}`}
        value={role}
        disabled={pending}
        onChange={(e) => run(() => changeRole({ workspaceId, userId, role: e.target.value as Role }))}
        className="border-border bg-surface rounded-md border px-2 py-1 text-sm"
      >
        {roles.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending}
        aria-label={`Remove ${label}`}
        onClick={() => {
          if (confirm(`Remove ${label} from this workspace?`)) run(() => removeMember({ workspaceId, userId }));
        }}
        className="text-risk rounded-md px-2 py-1 text-sm hover:underline disabled:opacity-60"
      >
        Remove
      </button>
      {error && (
        <p role="alert" className="text-risk w-full text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

export function RevokeInviteButton({
  workspaceId,
  invitationId,
  email,
}: {
  workspaceId: string;
  invitationId: string;
  email: string;
}) {
  const { pending, error, run } = useAction();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-label={`Revoke invite for ${email}`}
        onClick={() => run(() => revokeInvite({ workspaceId, invitationId }))}
        className="text-risk rounded-md px-2 py-1 text-sm hover:underline disabled:opacity-60"
      >
        Revoke
      </button>
      {error && (
        <p role="alert" className="text-risk w-full text-xs">
          {error}
        </p>
      )}
    </>
  );
}
