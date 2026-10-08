"use client";

import { useActionState, useState } from "react";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";
import {
  changeMemberRole,
  inviteMember,
  removeMember,
  revokeInvitation,
  type ActionState,
} from "../../workspace-actions";

const idle: ActionState = { status: "idle" };
const field =
  "border-border bg-surface focus-visible:ring-brand rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";
const primary =
  "bg-brand focus-visible:ring-brand dark:text-background rounded-md px-4 py-2 text-sm font-medium text-white focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60";
const secondary =
  "border-border focus-visible:ring-brand rounded-md border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60";

function Message({ state }: { state: ActionState }) {
  if (state.status === "error")
    return (
      <p role="alert" className="text-risk text-sm">
        {state.message}
      </p>
    );
  if (state.status === "ok" && state.message)
    return (
      <p role="status" className="text-confirmed text-sm">
        {state.message}
      </p>
    );
  return null;
}

function CopyLink({ link }: { link: string }) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        readOnly
        aria-label="Invitation link"
        value={link}
        className={`${field} min-w-0 flex-1 font-mono text-xs`}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        className={secondary}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopy("copied");
          } catch {
            setCopy("failed");
          }
        }}
      >
        {copy === "copied" ? "Copied" : "Copy link"}
      </button>
      {copy === "failed" && (
        <p role="alert" className="text-risk w-full text-sm">
          Couldn&apos;t copy automatically. Select the link and copy it.
        </p>
      )}
    </div>
  );
}

export function InviteForm({
  workspaceId,
  roles,
}: {
  workspaceId: string;
  roles: Role[];
}) {
  const [state, action, pending] = useActionState(inviteMember, idle);

  return (
    <div className="flex flex-col gap-3">
      <form
        action={action}
        className="flex flex-wrap items-end gap-3"
        noValidate
      >
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-role" className="text-sm font-medium">
            Invite as
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
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Creating…" : "Create invitation"}
        </button>
      </form>
      <Message state={state} />
      {state.status === "ok" && state.link && (
        <div className="border-border bg-surface flex flex-col gap-2 rounded-lg border p-4">
          <p className="text-sm">
            Send this link to them. It works once, for that email address, for 7
            days.
          </p>
          <CopyLink key={state.link} link={state.link} />
        </div>
      )}
    </div>
  );
}

export function MemberActions({
  workspaceId,
  userId,
  email,
  role,
  roleOptions,
  canChange,
  canRemove,
  isSelf,
}: {
  workspaceId: string;
  userId: string;
  email: string;
  role: Role;
  roleOptions: Role[];
  canChange: boolean;
  canRemove: boolean;
  isSelf: boolean;
}) {
  const [roleState, roleAction, rolePending] = useActionState(
    changeMemberRole,
    idle,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeMember,
    idle,
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {canChange ? (
          <form action={roleAction} className="flex items-center gap-2">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="userId" value={userId} />
            <label htmlFor={`role-${userId}`} className="sr-only">
              Role for {email}
            </label>
            <select
              id={`role-${userId}`}
              name="role"
              defaultValue={role}
              className={field}
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={rolePending}
              aria-label={`Save role for ${email}`}
              className={secondary}
            >
              Save
            </button>
          </form>
        ) : (
          <span className="border-border rounded-md border px-2 py-1 text-xs">
            {ROLE_LABELS[role]}
          </span>
        )}
        {canRemove && (
          <form
            action={removeAction}
            onSubmit={(e) => {
              const msg = isSelf
                ? "Leave this workspace? You will lose access."
                : `Remove ${email} from the workspace?`;
              if (!window.confirm(msg)) e.preventDefault();
            }}
          >
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="userId" value={userId} />
            <button
              type="submit"
              disabled={removePending}
              aria-label={isSelf ? "Leave this workspace" : `Remove ${email}`}
              className={`${secondary} text-risk`}
            >
              {isSelf ? "Leave" : "Remove"}
            </button>
          </form>
        )}
      </div>
      <Message state={roleState} />
      <Message state={removeState} />
    </div>
  );
}

export function RevokeInvitation({
  invitationId,
  email,
}: {
  invitationId: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(revokeInvitation, idle);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="invitationId" value={invitationId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Revoke invitation for ${email}`}
        className={secondary}
      >
        Revoke
      </button>
      <Message state={state} />
    </form>
  );
}
