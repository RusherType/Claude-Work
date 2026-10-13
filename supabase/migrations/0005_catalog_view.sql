-- CD-023: catalog table.
--
-- catalog_items: one row per product with its current US classification, read with the caller's
-- rights (security_invoker), so the products and classifications policies decide what is seen.
-- Trigram indexes keep title/SKU search fast at 10,000+ products per workspace.

create view catalog_items with (security_invoker = true) as
select
  p.id,
  p.workspace_id,
  p.title,
  p.sku,
  p.origin_country,
  p.image_urls[1] as image_url,
  p.customs_value,
  p.currency,
  p.created_at,
  p.updated_at,
  c.code,
  left(c.code, 2) as chapter,
  c.status,
  c.confidence,
  c.created_at as checked_at
from public.products p
left join public.classifications c
  on c.product_id = p.id
  and c.workspace_id = p.workspace_id
  and c.is_current
  and c.market = 'US';

revoke all on catalog_items from anon, authenticated;
grant select on catalog_items to authenticated;

create index products_title_trgm on products using gin (title gin_trgm_ops);
create index products_sku_trgm on products using gin (sku gin_trgm_ops);
create index products_workspace_created on products (workspace_id, created_at desc);

-- Filter choices for the catalog: how many products per status, origin and chapter.
create or replace function catalog_facets(p_workspace_id uuid)
returns table (facet text, value text, products bigint)
language sql stable security invoker set search_path = '' as $$
  select 'status', coalesce(status::text, 'unclassified'), count(*)
    from public.catalog_items where workspace_id = p_workspace_id group by 2
  union all
  select 'origin', origin_country, count(*)
    from public.catalog_items where workspace_id = p_workspace_id and origin_country is not null
    group by 2
  union all
  select 'chapter', chapter, count(*)
    from public.catalog_items where workspace_id = p_workspace_id and chapter is not null
    group by 2
  order by 1, 2;
$$;

revoke execute on function catalog_facets(uuid) from public, anon;
grant execute on function catalog_facets(uuid) to authenticated;
