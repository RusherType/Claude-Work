import Link from "next/link";
import { redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/admin/access";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { signOut } from "./actions";
import { switchWorkspace } from "./workspace-actions";

// Second line of defence after proxy.ts: every /app page renders only for a verified user.
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/sign-in?next=/app");
  const [admin, queued] = await Promise.all([
    isPlatformAdmin(ctx.user.id),
    ctx.workspace ? reviewCount(ctx.workspace.id) : null,
  ]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <Link href="/app" className="text-brand text-sm font-semibold">
            ClearDuty
          </Link>
          {ctx.workspaces.length > 1 && ctx.workspace && (
            <form action={switchWorkspace} className="flex items-center gap-2">
              <label htmlFor="workspaceId" className="sr-only">
                Workspace
              </label>
              <select
                id="workspaceId"
                name="workspaceId"
                defaultValue={ctx.workspace.id}
                className="border-border bg-surface rounded-md border px-2 py-1 text-sm"
              >
                {ctx.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="text-brand text-sm underline">
                Switch
              </button>
            </form>
          )}
          {ctx.workspace && (
            <>
              <Link href="/app/catalog" className="text-sm">
                Catalog
              </Link>
              <Link href="/app/review" className="text-sm">
                Review queue
                {queued ? (
                  <span className="bg-review dark:text-background ml-1 rounded-full px-1.5 py-0.5 text-xs font-medium text-white">
                    {queued > 999 ? "999+" : queued}
                    <span className="sr-only"> to review</span>
                  </span>
                ) : null}
              </Link>
              <Link href="/app/catalog/import" className="text-sm">
                Import products
              </Link>
              <Link href="/app/settings/team" className="text-sm">
                Team
              </Link>
            </>
          )}
          {admin && (
            <Link href="/app/admin" className="text-sm">
              Admin
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span
            className="text-muted hidden sm:inline"
            data-testid="signed-in-as"
          >
            {ctx.user.email}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="border-border focus-visible:ring-brand rounded-md border px-3 py-1.5 focus-visible:ring-2 focus-visible:outline-none"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-8 sm:px-6">
        {children}
      </div>
    </div>
  );
}

/** How many codes wait for a person (the sidebar badge); null when it can't be read. */
async function reviewCount(workspaceId: string): Promise<number | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { count, error } = await supabase
    .from("review_queue")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("market", "US");
  return error ? null : count;
}
