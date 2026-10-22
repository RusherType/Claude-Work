import { formatHts } from "@/lib/tariff/hts";

const steps = [
  {
    title: "Connect your store",
    body: "Install the Shopify app or upload a CSV of your products.",
  },
  {
    title: "Review suggested codes",
    body: "Each product gets a 10-digit HTS code with its reasoning and cited CBP rulings. You confirm.",
  },
  {
    title: "Know your landed cost",
    body: "See duty, overlays and fees per SKU, and get alerted when tariffs change.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-4 py-20 sm:px-8">
      <section className="flex flex-col gap-6">
        <p className="text-brand text-sm font-medium">ClearDuty · US market</p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Know your US duty on every SKU before it ships
        </h1>
        <p className="text-muted max-w-xl text-lg">
          AI tariff classification and landed-cost calculations for cross-border
          e-commerce sellers. Every code comes with its evidence.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/sign-in"
            className="bg-brand focus-visible:ring-brand dark:text-background rounded-md px-4 py-2.5 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Start free trial
          </a>
          <span className="border-border bg-surface rounded-md border px-3 py-2 font-mono text-sm tabular-nums">
            Suggested: {formatHts("6109100012")}
          </span>
        </div>
      </section>

      <section aria-labelledby="how" className="flex flex-col gap-6">
        <h2 id="how" className="text-xl font-semibold">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="border-border bg-surface rounded-lg border p-5"
            >
              <p className="text-muted font-mono text-sm">0{i + 1}</p>
              <h3 className="mt-2 font-semibold">{step.title}</h3>
              <p className="text-muted mt-1 text-sm">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-muted text-xs">
        ClearDuty is decision support for importers classifying their own goods.
        It is not a licensed customs broker and does not guarantee a code.
      </p>
    </main>
  );
}
