export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3">
      <div className="bg-border h-7 w-48 animate-pulse rounded" />
      <div className="bg-border h-4 w-64 animate-pulse rounded" />
      <div className="bg-border mt-4 h-32 w-full animate-pulse rounded-lg" />
    </div>
  );
}
