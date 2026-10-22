"use client";

import { useRef } from "react";
import type { WorkspaceMembership } from "@/lib/workspace/current";
import { switchWorkspace } from "./actions";

export function WorkspaceSwitcher({
  workspaces,
  currentId,
}: {
  workspaces: WorkspaceMembership[];
  currentId: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  if (workspaces.length < 2) {
    return <span className="text-sm font-medium">{workspaces[0]?.name}</span>;
  }
  return (
    <form ref={form} action={switchWorkspace}>
      <label htmlFor="workspace" className="sr-only">
        Workspace
      </label>
      <select
        id="workspace"
        name="workspaceId"
        defaultValue={currentId}
        onChange={() => form.current?.requestSubmit()}
        className="border-border bg-surface focus-visible:ring-brand rounded-md border px-2 py-1 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </form>
  );
}
