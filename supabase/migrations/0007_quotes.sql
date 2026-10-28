-- CD-051: landed-cost quotes.
--
-- The app computes a quote with the landed-cost engine (lib/tariff/landed-cost) on the server and
-- stores the inputs and the result. Every rate, fee and program comes from published reference
-- rows; the exchange rate is entered by the person (never built in) and stored with the quote.

-- ============ 1. Quote columns and checks ============
alter table quotes
  add column entry_date date,
  add column currency char(3),
  add column fx_rate_to_usd numeric(18, 8),
  add column carrier text,
  add column status text,
  add column tariff_revision_id uuid references tariff_revisions;

alter table quotes add constraint quotes_values check (
  name is not null and char_length(name) between 1 and 120
    and public.is_clean_text(name) and public.is_not_blank(name)
  and origin ~ '^[A-Z]{2}$'
  and mode in ('postal', 'express', 'ocean', 'air')
  and destination = 'US'
  and entry_date is not null
  and currency ~ '^[A-Z]{3}$'
  and fx_rate_to_usd > 0
  and (carrier is null or (char_length(carrier) between 1 and 60
    and public.is_clean_text(carrier) and public.is_not_blank(carrier)))
  and status in ('ok', 'needs_review')
  and jsonb_typeof(totals) = 'object'
);

-- Each line keeps what it was quoted with (title, SKU, code), so the quote still reads the same
-- after the product changes or is deleted.
alter table quote_lines
  add column title text,
  add column sku text,
  add column position integer;

alter table quote_lines add constraint quote_lines_values check (
  quantity between 1 and 1000000
  and unit_value is not null and unit_value >= 0
  and code_used ~ '^[0-9]{10}$'
  and title is not null and char_length(title) between 1 and 500 and public.is_clean_text(title)
  and (sku is null or (char_length(sku) <= 100 and public.is_clean_text(sku)))
  and position between 1 and 100
  and jsonb_typeof(breakdown) = 'object'
);

-- Deleting a product keeps the quotes that used it (the line keeps its title, SKU and code).
alter table quote_lines drop constraint quote_lines_workspace_id_product_id_fkey;
alter table quote_lines add constraint quote_lines_workspace_id_product_id_fkey
  foreign key (workspace_id, product_id) references products (workspace_id, id)
  on delete set null (product_id);

create index quotes_workspace_created on quotes (workspace_id, created_at desc);
create index quote_lines_quote on quote_lines (workspace_id, quote_id, position);

-- ============ 2. Saving a quote in one transaction ============
-- Security invoker: RLS decides (owners, admins and members write quotes). The app passes what
-- the engine computed on the server; this only makes the quote and its lines one write.
create or replace function save_quote(p_workspace uuid, p_quote jsonb, p_lines jsonb)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.has_role(p_workspace, array['owner', 'admin', 'member']::public.member_role[])
     or exists (select 1 from public.workspaces w
                where w.id = p_workspace and w.deleted_at is not null) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_quote) is distinct from 'object'
     or jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'invalid_quote' using errcode = '22023';
  end if;

  insert into public.quotes (workspace_id, name, origin, mode, destination, entry_date, currency,
    fx_rate_to_usd, carrier, status, tariff_revision_id, totals)
  values (p_workspace, p_quote ->> 'name', p_quote ->> 'origin', p_quote ->> 'mode', 'US',
    (p_quote ->> 'entry_date')::date, p_quote ->> 'currency',
    (p_quote ->> 'fx_rate_to_usd')::numeric, nullif(p_quote ->> 'carrier', ''),
    p_quote ->> 'status', (p_quote ->> 'tariff_revision_id')::uuid, p_quote -> 'totals')
  returning id into v_id;

  insert into public.quote_lines (quote_id, workspace_id, product_id, quantity, unit_value,
    code_used, used_suggested, breakdown, title, sku, position)
  select v_id, p_workspace, (l ->> 'product_id')::uuid, (l ->> 'quantity')::integer,
    (l ->> 'unit_value')::numeric, l ->> 'code_used', (l ->> 'used_suggested')::boolean,
    l -> 'breakdown', l ->> 'title', nullif(l ->> 'sku', ''), o::integer
  from jsonb_array_elements(p_lines) with ordinality as e(l, o);
  return v_id;
end $$;

revoke execute on function save_quote(uuid, jsonb, jsonb) from public, anon;
grant execute on function save_quote(uuid, jsonb, jsonb) to authenticated;
