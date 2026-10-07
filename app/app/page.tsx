import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard · ClearDuty" };

// Placeholder until CD-004 (workspaces) and the dashboard screens land.
export default function AppHome() {
  return (
    <section className="border-border bg-surface flex flex-col items-start gap-3 rounded-lg border p-6">
      <h1 className="text-xl font-semibold">You&apos;re signed in</h1>
      <p className="text-muted text-sm">
        Next you&apos;ll create a workspace for your company and connect your
        catalog.
      </p>
    </section>
  );
}
