"use client";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <section
      role="alert"
      className="border-risk bg-surface flex flex-col items-start gap-3 rounded-lg border p-6"
    >
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-muted text-sm">
        We couldn&apos;t load this page. Try again; if it keeps happening,
        contact support with this reference.
      </p>
      {error.digest && (
        <p className="text-muted font-mono text-xs">Ref: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={() => retry()}
        className="bg-brand focus-visible:ring-brand dark:text-background rounded-md px-4 py-2 text-sm font-medium text-white focus-visible:ring-2 focus-visible:outline-none"
      >
        Try again
      </button>
    </section>
  );
}
