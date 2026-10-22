"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="border-border bg-surface mx-auto max-w-md rounded-lg border p-6">
      <h1 className="font-semibold">Something went wrong</h1>
      <p className="text-muted mt-1 text-sm">
        We couldn&apos;t load this page. Try again, and if it keeps happening send us the reference below.
      </p>
      {error.digest && <p className="text-muted mt-3 font-mono text-xs">Reference: {error.digest}</p>}
      <button
        type="button"
        onClick={reset}
        className="bg-brand dark:text-background mt-4 rounded-md px-4 py-2 text-sm font-medium text-white"
      >
        Try again
      </button>
    </div>
  );
}
