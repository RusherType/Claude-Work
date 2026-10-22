import Link from "next/link";
import { signOut } from "@/app/sign-in/actions";
import {
  getCurrentWorkspace,
  listWorkspaces,
  requireUser,
} from "@/lib/workspace/current";
import { WorkspaceSwitcher } from "./workspace-switcher";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const { user } = await requireUser();
  const [workspaces, current] = await Promise.all([
    listWorkspaces(),
    getCurrentWorkspace(),
  ]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-border bg-surface border-b">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/app" className="text-brand font-semibold">
            ClearDuty
          </Link>
          {current && (
            <WorkspaceSwitcher workspaces={workspaces} currentId={current.id} />
          )}
          {current && (
            <nav aria-label="Main" className="flex gap-4 text-sm">
              <Link href="/app" className="hover:text-brand">
                Dashboard
              </Link>
              <Link href="/app/settings/team" className="hover:text-brand">
                Team
              </Link>
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted hidden sm:inline">{user.email}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="border-border focus-visible:ring-brand rounded-md border px-3 py-1.5 focus-visible:ring-2 focus-visible:outline-none"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
