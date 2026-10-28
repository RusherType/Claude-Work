import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { readFacts } from "@/lib/catalog/facts";
import type { CatalogStatus } from "@/lib/catalog/listing";
import { loadCard } from "@/lib/classification/card";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { ClassificationCard } from "../../_classification/classification-card";
import { ProductForm, type ProductValues } from "./product-form";

export const metadata: Metadata = { title: "Product · ClearDuty" };

const DECIDED: Record<string, string> = {
  confirmed: "Code confirmed.",
  overridden: "Your code is saved and confirmed.",
  answered:
    "Answer saved. The agent will use it when it checks this product again.",
};

export default async function ProductPage(
  props: PageProps<"/app/catalog/[id]">,
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/sign-in?next=/app/catalog");
  if (!ctx.workspace) redirect("/app");
  const { id } = await props.params;
  const { saved, decided, from } = await props.searchParams;
  const decidedText =
    typeof decided === "string" && Object.hasOwn(DECIDED, decided)
      ? DECIDED[decided]
      : null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  // Errors surface through app/app/error.tsx (plain message + retry).
  const [product, card] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, workspace_id, sku, title, description, product_type, vendor, tags, image_urls, origin_country, customs_value::text, currency, weight_kg::text, facts, updated_at::text, integration_id, content_hash",
      )
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .maybeSingle(),
    loadCard(supabase, ctx.workspace.id, id),
  ]);
  if (product.error) throw new Error("Could not load the product");
  if (!product.data) notFound();
  const p = product.data;
  const status: CatalogStatus = card.current?.status ?? "unclassified";
  const canEdit = ctx.workspace.role !== "viewer";
  const facts = readFacts(p.facts);
  const values: ProductValues = {
    title: p.title,
    description: p.description ?? "",
    product_type: p.product_type ?? "",
    vendor: p.vendor ?? "",
    tags: (p.tags ?? []).join(", "),
    image_urls: (p.image_urls ?? []).join("\n"),
    origin_country: p.origin_country ?? "",
    customs_value: p.customs_value ?? "",
    currency: p.customs_value ? (p.currency ?? "USD") : "USD",
    weight_kg: p.weight_kg ?? "",
    function: facts.function ?? "",
    user: facts.user ?? "",
    form: facts.form ?? "",
    materials: facts.materials.map((m) => ({
      name: m.name,
      percent: m.percent ?? "",
    })),
  };

  return (
    <div className="flex flex-col gap-4">
      {from === "review" ? (
        <Link href="/app/review" className="text-brand text-sm underline">
          ← Review queue
        </Link>
      ) : (
        <Link href="/app/catalog" className="text-brand text-sm underline">
          ← Catalog
        </Link>
      )}
      <div>
        <h1 className="text-xl font-semibold">{p.title}</h1>
        <p className="text-muted mt-1 font-mono text-xs">{p.sku ?? "No SKU"}</p>
      </div>

      {saved && (
        <p
          role="status"
          className={
            saved === "outdated"
              ? "text-risk text-sm"
              : "text-confirmed text-sm"
          }
        >
          {saved === "outdated"
            ? "Saved. The confirmed code is now Outdated and needs to be checked again."
            : "Saved."}
        </p>
      )}

      {decidedText && (
        <p role="status" className="text-confirmed text-sm">
          {decidedText}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <section
          aria-labelledby="details-heading"
          className="flex flex-col gap-3"
        >
          <h2 id="details-heading" className="text-base font-semibold">
            Details and facts
          </h2>
          {canEdit ? (
            <ProductForm
              productId={p.id}
              version={p.updated_at ?? ""}
              values={values}
              confirmed={status === "confirmed" || status === "broker_verified"}
              synced={p.integration_id !== null}
            />
          ) : (
            <ReadOnly values={values} />
          )}
        </section>

        <ClassificationCard
          data={card}
          productId={p.id}
          contentHash={p.content_hash ?? ""}
          canDecide={canEdit}
          canReplaceVerified={
            ctx.workspace.role === "owner" || ctx.workspace.role === "admin"
          }
          origin={{ from: "product" }}
        />
      </div>
    </div>
  );
}

function ReadOnly({ values }: { values: ProductValues }) {
  const rows: [string, string][] = [
    ["Title", values.title],
    ["Description", values.description],
    ["Product type", values.product_type],
    ["Vendor", values.vendor],
    ["Tags", values.tags],
    ["Country of origin", values.origin_country],
    [
      "Customs value",
      values.customs_value ? `${values.customs_value} ${values.currency}` : "",
    ],
    ["Weight (kg)", values.weight_kg],
    [
      "Materials",
      values.materials
        .map((m) => (m.percent ? `${m.name} ${m.percent}%` : m.name))
        .join(", "),
    ],
    ["What it does", values.function],
    ["Who uses it", values.user],
    ["How it's made", values.form],
  ];
  return (
    <dl className="border-border bg-surface grid gap-x-6 gap-y-2 rounded-lg border p-4 text-sm sm:grid-cols-[max-content_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="break-words whitespace-pre-line">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
