export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">Loading…</span>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-border h-12 animate-pulse rounded-lg motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
