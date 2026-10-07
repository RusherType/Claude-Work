import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { signOut } from "./actions";

// Second line of defence after proxy.ts: every /app page renders only for a verified user.
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/app");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-border bg-surface flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <Link href="/app" className="text-brand text-sm font-semibold">
          ClearDuty
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span
            className="text-muted hidden sm:inline"
            data-testid="signed-in-as"
          >
            {user.email}
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
