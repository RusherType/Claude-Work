-- CD-022: CSV product import.
--
-- 1. content_hash is computed by the database from the fields that decide a product's code, so a
--    client cannot edit a confirmed product and keep its old hash (which would skip "outdated").
--    mark_outdated_on_edit is replaced to use the computed hash.
-- 2. Products added by hand or by CSV (no integration) have unique SKUs per workspace, so a
--    re-import updates them instead of adding copies.
-- 3. import_products() upserts one batch as the calling user (RLS applies).
-- 4. Value checks on products, matching what the import and the Shopify sync send.

-- ============ 1. content hash ============
-- Only the fields the classification depends on. Vendor, images, origin, value and weight change
-- the landed cost, not the code, so they do not mark a confirmed code outdated.
create or replace function product_content_hash(
  p_title text, p_description text, p_product_type text, p_tags text[], p_facts jsonb
) returns text
language sql immutable set search_path = '' as $$
  select md5(jsonb_build_array(p_title, p_description, p_product_type, p_tags, p_facts)::text);
$$;

create or replace function set_product_content_hash() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.content_hash := public.product_content_hash(
    new.title, new.description, new.product_type, new.tags, new.facts);
  return new;
end $$;

create trigger products_content_hash before insert on products
for each row execute function set_product_content_hash();

-- On update the stored hash is always recomputed. A confirmed code becomes outdated when the
-- content changed, and also when a client sends a different hash (a needless re-check at worst,
-- never a hidden edit).
create or replace function mark_outdated_on_edit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text := public.product_content_hash(
    new.title, new.description, new.product_type, new.tags, new.facts);
begin
  if v_hash is distinct from old.content_hash
     or new.content_hash is distinct from old.content_hash then
    update public.classifications set status = 'outdated'
    where product_id = new.id and workspace_id = new.workspace_id and is_current
      and status in ('confirmed', 'broker_verified');
  end if;
  new.content_hash := v_hash;
  new.updated_at := now();
  return new;
end $$;

revoke execute on function set_product_content_hash(), mark_outdated_on_edit()
  from public, anon, authenticated;

-- ============ 2. unique SKU for products without an integration ============
create unique index products_manual_sku_key on products (workspace_id, sku)
  where integration_id is null and sku is not null;

-- ============ 4. value checks ============
alter table products
  add constraint products_title_length check (char_length(title) between 1 and 500),
  add constraint products_sku_length check (sku is null or char_length(sku) between 1 and 100),
  add constraint products_description_length check (char_length(description) <= 65535),
  add constraint products_origin_format check (origin_country ~ '^[A-Z]{2}$'),
  add constraint products_currency_format check (currency ~ '^[A-Z]{3}$'),
  add constraint products_value_nonnegative check (customs_value >= 0),
  add constraint products_weight_nonnegative check (weight_kg >= 0),
  add constraint products_tags_count check (cardinality(tags) <= 250),
  add constraint products_images_count check (cardinality(image_urls) <= 250);

-- ============ 3. import ============
-- Runs as the caller, so the products policies decide what it may write. Blank fields
-- (JSON null or an empty list) never overwrite stored values. Returns how many rows were added,
-- changed, or already matched.
create or replace function import_products(p_workspace_id uuid, p_rows jsonb)
returns table (inserted integer, updated integer, unchanged integer)
language plpgsql security invoker set search_path = '' as $$
declare
  v_count integer;
begin
  if not public.has_role(p_workspace_id, array['owner', 'admin', 'member']::public.member_role[]) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'invalid_rows' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count = 0 or v_count > 1000 then
    raise exception 'invalid_batch_size' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rows) e
    where jsonb_typeof(e) <> 'object'
      or coalesce(e ->> 'sku', '') = '' or coalesce(e ->> 'title', '') = ''
  ) then
    raise exception 'sku_and_title_required' using errcode = '23502';
  end if;
  if (select count(distinct e ->> 'sku') from jsonb_array_elements(p_rows) e) <> v_count then
    raise exception 'duplicate_sku' using errcode = '23505';
  end if;

  return query
  with import_rows as (
    select r.*
    from jsonb_to_recordset(p_rows) as r(
      sku text, title text, description text, product_type text, vendor text,
      tags text[], image_urls text[], origin_country text, customs_value numeric,
      currency text, weight_kg numeric
    )
  ),
  changed as (
    update public.products p set
      title = i.title,
      description = coalesce(i.description, p.description),
      product_type = coalesce(i.product_type, p.product_type),
      vendor = coalesce(i.vendor, p.vendor),
      tags = coalesce(nullif(i.tags, '{}'), p.tags),
      image_urls = coalesce(nullif(i.image_urls, '{}'), p.image_urls),
      origin_country = coalesce(i.origin_country, p.origin_country),
      customs_value = coalesce(i.customs_value, p.customs_value),
      currency = coalesce(i.currency, p.currency),
      weight_kg = coalesce(i.weight_kg, p.weight_kg)
    from import_rows i
    where p.workspace_id = p_workspace_id
      and p.integration_id is null
      and p.sku = i.sku
      and (p.title, p.description, p.product_type, p.vendor, p.tags, p.image_urls,
           p.origin_country, p.customs_value, p.currency, p.weight_kg)
          is distinct from
          (i.title, coalesce(i.description, p.description),
           coalesce(i.product_type, p.product_type), coalesce(i.vendor, p.vendor),
           coalesce(nullif(i.tags, '{}'), p.tags),
           coalesce(nullif(i.image_urls, '{}'), p.image_urls),
           coalesce(i.origin_country, p.origin_country),
           coalesce(i.customs_value, p.customs_value), coalesce(i.currency, p.currency),
           coalesce(i.weight_kg, p.weight_kg))
    returning p.sku
  ),
  existing as (
    select p.sku from public.products p
    where p.workspace_id = p_workspace_id and p.integration_id is null
      and p.sku in (select sku from import_rows)
  ),
  added as (
    insert into public.products (
      workspace_id, sku, title, description, product_type, vendor, tags, image_urls,
      origin_country, customs_value, currency, weight_kg
    )
    select p_workspace_id, i.sku, i.title, i.description, i.product_type, i.vendor,
      coalesce(i.tags, '{}'), coalesce(i.image_urls, '{}'), i.origin_country,
      i.customs_value, coalesce(i.currency, 'USD'), i.weight_kg
    from import_rows i
    where i.sku not in (select sku from existing)
    returning 1
  )
  select
    (select count(*)::integer from added),
    (select count(*)::integer from changed),
    v_count - (select count(*)::integer from added) - (select count(*)::integer from changed);
end $$;

revoke execute on function import_products(uuid, jsonb) from public, anon;
grant execute on function import_products(uuid, jsonb) to authenticated;
