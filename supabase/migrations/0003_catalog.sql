-- CD-022: CSV product import.
--
-- 1. content_hash is computed by the database from the fields that decide a product's code, so a
--    client cannot edit a confirmed product and keep its old hash (which would skip "outdated").
--    mark_outdated_on_edit is replaced to use the computed hash.
-- 2. Products added by hand or by CSV (no integration, no external id) have unique SKUs per
--    workspace, so a re-import updates them instead of adding copies.
-- 3. import_products() upserts one batch as the calling user (RLS applies).
-- 4. Value checks on products, matching the import's Zod schema, so the Data API cannot skip them.

-- ============ 1. content hash ============
-- Every field the classification can depend on: text, tags and facts, the images the agent reads,
-- and value and weight (some HTS lines split on "valued over $X" or "weighing not more than Y").
-- Vendor and origin do not change the code, so they are left out.
create or replace function product_content_hash(
  p_title text, p_description text, p_product_type text, p_tags text[], p_facts jsonb,
  p_image_urls text[], p_customs_value numeric, p_currency text, p_weight_kg numeric
) returns text
language sql stable set search_path = '' as $$
  select encode(sha256(convert_to(jsonb_build_array(
    p_title, p_description, p_product_type, p_tags, p_facts,
    p_image_urls, p_customs_value, p_currency, p_weight_kg
  )::text, 'UTF8')), 'hex');
$$;

revoke execute on function product_content_hash(text, text, text, text[], jsonb, text[], numeric, text, numeric)
  from public, anon;
grant execute on function product_content_hash(text, text, text, text[], jsonb, text[], numeric, text, numeric)
  to authenticated, service_role;

create or replace function set_product_content_hash() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.content_hash := public.product_content_hash(
    new.title, new.description, new.product_type, new.tags, new.facts,
    new.image_urls, new.customs_value, new.currency, new.weight_kg);
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
    new.title, new.description, new.product_type, new.tags, new.facts,
    new.image_urls, new.customs_value, new.currency, new.weight_kg);
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

-- Existing rows get the computed hash without marking anything outdated.
alter table products disable trigger products_outdated;
update products set content_hash = product_content_hash(
  title, description, product_type, tags, facts, image_urls, customs_value, currency, weight_kg);
alter table products enable trigger products_outdated;

-- ============ 2. unique SKU for manual products ============
-- Manual means added by hand or by CSV: no integration and no external id. Products that keep
-- an external id after their integration is deleted (integration_id set null) stay out of it,
-- so disconnecting a store never collides with manual SKUs.
create unique index products_manual_sku_key on products (workspace_id, sku)
  where integration_id is null and external_id is null and sku is not null;

-- ============ 4. value checks ============
-- The same limits as the import's Zod schema, so writes through the Data API cannot skip them.
create or replace function all_match(p_values text[], p_pattern text, p_max_length integer)
returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(v ~ p_pattern and char_length(v) <= p_max_length), true)
  from unnest(p_values) v;
$$;

alter table products
  add constraint products_title_length check (char_length(title) between 1 and 500 and btrim(title) <> ''),
  add constraint products_sku_length check (sku is null or (char_length(sku) between 1 and 100 and btrim(sku) <> '')),
  add constraint products_description_length check (char_length(description) <= 20000),
  add constraint products_product_type_length check (char_length(product_type) <= 200),
  add constraint products_vendor_length check (char_length(vendor) <= 200),
  add constraint products_origin_format check (origin_country ~ '^[A-Z]{2}$'),
  add constraint products_currency_format check (currency ~ '^[A-Z]{3}$'),
  add constraint products_value_valid check (customs_value >= 0 and customs_value <> 'NaN'),
  add constraint products_weight_valid check (weight_kg >= 0 and weight_kg <> 'NaN'),
  add constraint products_tags_valid check (
    cardinality(tags) <= 250 and all_match(tags, '\S', 100)),
  add constraint products_images_valid check (
    cardinality(image_urls) <= 250 and all_match(image_urls, '^https://\S+$', 2000));

-- ============ 3. import ============
-- Runs as the caller, so the products policies decide what it may write. Blank fields
-- (JSON null or an empty list) never overwrite stored values; a value always comes with its
-- currency. Returns how many rows were added,
-- changed, or already matched.
create or replace function import_products(p_workspace_id uuid, p_rows jsonb)
returns table (inserted integer, updated integer, unchanged integer)
language plpgsql security invoker set search_path = '' as $$
declare
  v_count integer;
begin
  if not public.has_role(p_workspace_id, array['owner', 'admin', 'member']::public.member_role[])
     or exists (select 1 from public.workspaces w
                where w.id = p_workspace_id and w.deleted_at is not null) then
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
  -- A value is stored with its currency, never one without the other.
  if exists (
    select 1 from jsonb_array_elements(p_rows) e
    where (coalesce(e ->> 'customs_value', '') = '') <> (coalesce(e ->> 'currency', '') = '')
  ) then
    raise exception 'value_needs_currency' using errcode = '23502';
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
      currency = case when i.customs_value is not null then i.currency else p.currency end,
      weight_kg = coalesce(i.weight_kg, p.weight_kg)
    from import_rows i
    where p.workspace_id = p_workspace_id
      and p.integration_id is null and p.external_id is null
      and p.sku = i.sku
      and (p.title, p.description, p.product_type, p.vendor, p.tags, p.image_urls,
           p.origin_country, p.customs_value, p.currency, p.weight_kg)
          is distinct from
          (i.title, coalesce(i.description, p.description),
           coalesce(i.product_type, p.product_type), coalesce(i.vendor, p.vendor),
           coalesce(nullif(i.tags, '{}'), p.tags),
           coalesce(nullif(i.image_urls, '{}'), p.image_urls),
           coalesce(i.origin_country, p.origin_country),
           coalesce(i.customs_value, p.customs_value),
           case when i.customs_value is not null then i.currency else p.currency end,
           coalesce(i.weight_kg, p.weight_kg))
    returning p.sku
  ),
  existing as (
    select p.sku from public.products p
    where p.workspace_id = p_workspace_id
      and p.integration_id is null and p.external_id is null
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
