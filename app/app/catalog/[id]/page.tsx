import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { COUNTRIES } from "@/lib/countries";
import { readFacts } from "@/lib/catalog/facts";
import { formatHtsCode, type CatalogStatus } from "@/lib/catalog/listing";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { StatusChip } from "../status-chip";
import { ProductForm, type ProductValues } from "./product-form";

export const metadata: Metadata = { title: "Product · ClearDuty" };

const COUNTRY_NAMES = new Map(COUNTRIES.map((c) => [c.code, c.name]));

export default async function ProductPage(
  props: PageProps<"/app/catalog/[id]">,
) {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/sign-in?next=/app/catalog");
  if (!ctx.workspace) redirect("/app");
  const { id } = await props.params;
  const { saved } = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  // Errors surface through app/app/error.tsx (plain message + retry).
  const [product, classification] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, workspace_id, sku, title, description, product_type, vendor, tags, image_urls, origin_country, customs_value::text, currency, weight_kg::text, facts, updated_at::text, integration_id",
      )
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .maybeSingle(),
    supabase
      .from("classifications")
      .select("code, status, confidence, created_at")
      .eq("product_id", id)
      .eq("is_current", true)
      .eq("market", "US")
      .maybeSingle(),
  ]);
  if (product.error || classification.error)
    throw new Error("Could not load the product");
  if (!product.data) notFound();
  const p = product.data;
  const c = classification.data;
  const status: CatalogStatus =
    (c?.status as CatalogStatus | undefined) ?? "unclassified";
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
      <Link href="/app/catalog" className="text-brand text-sm underline">
        ← Catalog
      </Link>
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

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
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

        <aside
          aria-labelledby="code-heading"
          className="border-border bg-surface flex h-fit flex-col gap-3 rounded-lg border p-4"
        >
          <h2 id="code-heading" className="text-base font-semibold">
            Tariff code
          </h2>
          <StatusChip status={status} />
          {c?.code ? (
            <p className="font-mono text-lg">{formatHtsCode(c.code)}</p>
          ) : (
            <p className="text-muted text-sm">
              Not classified yet. Suggested codes arrive with the AI agent.
            </p>
          )}
          {c?.status === "suggested" && c.confidence !== null && (
            <p className="text-muted text-sm">
              {Math.round(c.confidence * 100)}% sure. Suggested, not confirmed.
            </p>
          )}
          {c?.created_at && (
            <p className="text-muted text-xs">
              Last checked {c.created_at.slice(0, 10)}
            </p>
          )}
          {p.origin_country && (
            <p className="text-muted text-xs">
              Origin: {COUNTRY_NAMES.get(p.origin_country) ?? p.origin_country}
            </p>
          )}
        </aside>
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
