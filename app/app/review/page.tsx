import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readFacts } from "@/lib/catalog/facts";
import { loadCard } from "@/lib/classification/card";
import { createClient } from "@/lib/supabase/server";
import { primary, secondary } from "@/lib/ui/styles";
import { getWorkspaceContext } from "@/lib/workspace";
import { ClassificationCard } from "../_classification/classification-card";
import { ProductSummary } from "./product-summary";
import { ReviewShortcuts } from "./shortcuts";

export const metadata: Metadata = { title: "Review queue · ClearDuty" };

// CD-040: one product at a time, questions first, then low confidence, then outdated, then
// plain suggestions (review_position in 0006_review.sql). Decisions go through the card.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE: Record<string, string> = {
  confirmed: "Confirmed.",
  overridden: "Your code is saved and confirmed.",
  answered: "Answer saved.",
};
const at = (id: string | null) => (id ? `/app/review?at=${id}` : null);

export default async function ReviewPage(props: PageProps<"/app/review">) {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/sign-in?next=/app/review");
  if (!ctx.workspace) redirect("/app");
  const params = await props.searchParams;
  const requested =
    typeof params.at === "string" && UUID.test(params.at) ? params.at : null;
  const done =
    typeof params.done === "string" && Object.hasOwn(DONE, params.done)
      ? DONE[params.done]
      : undefined;

  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  // Errors surface through app/app/error.tsx (plain message + retry).
  const position = await supabase.rpc("review_position", {
    p_workspace: ctx.workspace.id,
    ...(requested ? { p_at: requested } : {}),
  });
  if (position.error) throw new Error("Could not load the review queue");
  const pos = position.data[0];

  if (!pos) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Review queue</h1>
        {done && (
          <p role="status" className="text-confirmed text-sm">
            {done}
          </p>
        )}
        <div className="border-border bg-surface flex flex-col items-start gap-3 rounded-lg border p-6">
          <p aria-hidden="true" className="text-confirmed text-2xl">
            ✓
          </p>
          <p className="text-sm">
            Nothing to review. Suggested codes and the agent&apos;s questions
            appear here as your catalog is classified.
          </p>
          <Link href="/app/catalog" className={primary}>
            Go to the catalog
          </Link>
        </div>
      </div>
    );
  }

  const item = await supabase
    .from("classifications")
    .select("product_id")
    .eq("id", pos.id)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (item.error) throw new Error("Could not load the review queue");
  if (!item.data) redirect("/app/review");
  const productId = item.data.product_id;

  const [product, card] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, sku, title, description, image_urls, origin_country, customs_value::text, currency, facts, content_hash",
      )
      .eq("id", productId)
      .eq("workspace_id", ctx.workspace.id)
      .maybeSingle(),
    loadCard(supabase, ctx.workspace.id, productId),
  ]);
  if (product.error) throw new Error("Could not load the product");
  if (!product.data) redirect("/app/review");
  // Someone else decided it a moment ago (the current code is now another row): start again
  // from the top rather than show a different code than the queue position says.
  if (card.current?.id !== pos.id) redirect("/app/review");
  const p = product.data;
  const canDecide = ctx.workspace.role !== "viewer";
  const prevHref = at(pos.prev_id);
  const nextHref = at(pos.next_id);
  const editHref = `/app/catalog/${p.id}?from=review`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Review queue</h1>
          <p className="text-muted text-sm">
            {pos.position} of {pos.total}
          </p>
        </div>
        <nav aria-label="Queue" className="flex flex-wrap gap-2">
          <NavLink href={prevHref} label="Previous" keyName="K" />
          <NavLink href={nextHref} label="Next" keyName="J" />
          <Link href={editHref} className={secondary}>
            Edit product <kbd className="text-muted text-xs">E</kbd>
          </Link>
        </nav>
      </div>
      {done && (
        <p role="status" className="text-confirmed text-sm">
          {done}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <ProductSummary
          product={{
            id: p.id,
            title: p.title,
            sku: p.sku,
            description: p.description,
            imageUrl: p.image_urls?.[0] ?? null,
            originCountry: p.origin_country,
            customsValue: p.customs_value,
            currency: p.currency,
            facts: readFacts(p.facts),
          }}
        />
        <ClassificationCard
          data={card}
          productId={p.id}
          contentHash={p.content_hash ?? ""}
          canDecide={canDecide}
          canReplaceVerified={
            ctx.workspace.role === "owner" || ctx.workspace.role === "admin"
          }
          origin={{ from: "review", nextId: pos.next_id ?? undefined }}
        />
      </div>

      <ReviewShortcuts
        prevHref={prevHref}
        nextHref={nextHref}
        editHref={editHref}
      />
    </div>
  );
}

function NavLink({
  href,
  label,
  keyName,
}: {
  href: string | null;
  label: string;
  keyName: string;
}) {
  const content = (
    <>
      {label} <kbd className="text-muted text-xs">{keyName}</kbd>
    </>
  );
  return href ? (
    <Link href={href} className={secondary}>
      {content}
    </Link>
  ) : (
    <span aria-disabled="true" className={`${secondary} opacity-50`}>
      {content}
    </span>
  );
}
