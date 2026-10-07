"use client";

// Last-resort boundary for errors in the root layout or a segment's own layout.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32 }}>
        <main role="alert">
          <h1>Something went wrong</h1>
          <p>
            We couldn&apos;t load ClearDuty. Try again; if it keeps happening,
            contact support.
          </p>
          {error.digest && (
            <p style={{ fontFamily: "monospace" }}>Ref: {error.digest}</p>
          )}
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
