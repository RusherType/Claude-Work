-- CD-051: landed-cost quotes.
--
-- The checks below assume the quote tables are empty, which holds in every environment (no
-- quotes were written before CD-051).
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
  and entry_date between '2000-01-01' and '2100-12-31'
  and currency ~ '^[A-Z]{3}$'
  and fx_rate_to_usd > 0 and fx_rate_to_usd <> 'NaN'
  and (carrier is null or (char_length(carrier) between 1 and 60
    and public.is_clean_text(carrier) and public.is_not_blank(carrier)))
  and status in ('ok', 'needs_review')
  and jsonb_typeof(totals) = 'object' and pg_column_size(totals) <= 32768
);

-- Each line keeps what it was quoted with (title, SKU, code), so the quote still reads the same
-- after the product changes or is deleted.
alter table quote_lines
  add column title text,
  add column sku text,
  add column position integer;

alter table quote_lines add constraint quote_lines_values check (
  quantity between 1 and 1000000
  and unit_value is not null and unit_value >= 0 and unit_value <> 'NaN'
  and code_used ~ '^[0-9]{10}$'
  and title is not null and char_length(title) between 1 and 500 and public.is_clean_text(title)
  and (sku is null or (char_length(sku) <= 100 and public.is_clean_text(sku)))
  and position between 1 and 100
  and jsonb_typeof(breakdown) = 'object' and pg_column_size(breakdown) <= 32768
);
-- A check passes on NULL, so every column a quote needs is also required.
alter table quotes
  alter column name set not null,
  alter column origin set not null,
  alter column mode set not null,
  alter column entry_date set not null,
  alter column currency set not null,
  alter column fx_rate_to_usd set not null,
  alter column status set not null,
  alter column totals set not null;
alter table quote_lines
  alter column unit_value set not null,
  alter column code_used set not null,
  alter column used_suggested set not null,
  alter column breakdown set not null,
  alter column title set not null,
  alter column position set not null;
-- One line per position: with the 1-100 check, at most 100 lines per quote.
alter table quote_lines add constraint quote_lines_position_key unique (quote_id, position);

-- Deleting a product keeps the quotes that used it (the line keeps its title, SKU and code).
alter table quote_lines drop constraint quote_lines_workspace_id_product_id_fkey;
alter table quote_lines add constraint quote_lines_workspace_id_product_id_fkey
  foreign key (workspace_id, product_id) references products (workspace_id, id)
  on delete set null (product_id);

create index quotes_workspace_created on quotes (workspace_id, created_at desc);
create index quote_lines_quote on quote_lines (workspace_id, quote_id, position);

-- ============ 2. Writes only through save_quote ============
-- A saved quote is a record of what was quoted (its PDF carries the workspace's name), so
-- clients cannot insert, edit or delete quote rows directly (the 0002 lockdown pattern).
drop policy quotes_write on quotes;
drop policy quote_lines_write on quote_lines;
revoke insert, update, delete on quotes, quote_lines from anon, authenticated;

-- ============ 3. The tariff revision for a date ============
-- The base rates of a quote come from the revision in force on its entry date, like its
-- measures, fees and programs.
create or replace function revision_on(p_market public.market_code, p_date date)
returns uuid
language sql stable security invoker set search_path = '' as $$
  select r.id from public.tariff_revisions r
  where r.market = p_market and r.effective_from <= p_date
  order by r.effective_from desc, r.imported_at desc
  limit 1;
$$;
revoke execute on function revision_on(public.market_code, date) from public, anon;
grant execute on function revision_on(public.market_code, date) to authenticated;

-- ============ 4. Saving a quote in one transaction ============
-- Security definer (clients cannot write quote rows): owners, admins and members of a live
-- workspace. The app passes what the landed-cost engine computed on the server. The figures are
-- the caller's own: a member calling this directly can save any figures, but nobody can change
-- a quote afterwards, and each save is in the audit log with who made it.
create or replace function save_quote(p_workspace uuid, p_quote jsonb, p_lines jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
begin
  if uid is null or not public.can_decide(p_workspace) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_quote) is distinct from 'object'
     or jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'invalid_quote' using errcode = '22023';
  end if;
  -- Limits that hold however the function is called (the app's rate limit does not cover a
  -- direct call): quotes per workspace, and saves per person per hour.
  if (select count(*) from public.quotes q where q.workspace_id = p_workspace) >= 2000 then
    raise exception 'quote_limit';
  end if;
  if (select count(*) from public.quotes q
      where q.workspace_id = p_workspace and q.created_by = uid
        and q.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'too_many_quotes';
  end if;

  insert into public.quotes (workspace_id, name, origin, mode, destination, entry_date, currency,
    fx_rate_to_usd, carrier, status, tariff_revision_id, totals, created_by)
  values (p_workspace, p_quote ->> 'name', p_quote ->> 'origin', p_quote ->> 'mode', 'US',
    (p_quote ->> 'entry_date')::date, p_quote ->> 'currency',
    (p_quote ->> 'fx_rate_to_usd')::numeric, nullif(p_quote ->> 'carrier', ''),
    p_quote ->> 'status', (p_quote ->> 'tariff_revision_id')::uuid, p_quote -> 'totals', uid)
  returning id into v_id;

  insert into public.quote_lines (quote_id, workspace_id, product_id, quantity, unit_value,
    code_used, used_suggested, breakdown, title, sku, position)
  select v_id, p_workspace, (l ->> 'product_id')::uuid, (l ->> 'quantity')::integer,
    (l ->> 'unit_value')::numeric, l ->> 'code_used', (l ->> 'used_suggested')::boolean,
    l -> 'breakdown', l ->> 'title', nullif(l ->> 'sku', ''), o::integer
  from jsonb_array_elements(p_lines) with ordinality as e(l, o);

  insert into public.audit_log (workspace_id, actor_id, action, entity, entity_id, data)
  values (p_workspace, uid, 'quote.save', 'quote', v_id,
    jsonb_build_object('name', p_quote ->> 'name', 'status', p_quote ->> 'status',
      'lines', jsonb_array_length(p_lines),
      'landed_cost', case
        when p_quote -> 'totals' -> 'totals' ->> 'landedCost' ~ '^-?[0-9]{1,30}(\.[0-9]{1,2})?$'
        then p_quote -> 'totals' -> 'totals' ->> 'landedCost' end));
  return v_id;
end $$;

-- Owners and admins can delete a quote (its lines go with it); the audit log keeps who and what.
create or replace function delete_quote(p_quote uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_workspace uuid;
  v_name text;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select q.workspace_id, q.name into v_workspace, v_name
  from public.quotes q where q.id = p_quote;
  if v_workspace is null
     or not public.has_role(v_workspace, array['owner', 'admin']::public.member_role[])
     or exists (select 1 from public.workspaces w
                where w.id = v_workspace and w.deleted_at is not null) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.quotes where id = p_quote and workspace_id = v_workspace;
  insert into public.audit_log (workspace_id, actor_id, action, entity, entity_id, data)
  values (v_workspace, uid, 'quote.delete', 'quote', p_quote, jsonb_build_object('name', v_name));
end $$;

revoke execute on function save_quote(uuid, jsonb, jsonb), delete_quote(uuid) from public, anon;
grant execute on function save_quote(uuid, jsonb, jsonb), delete_quote(uuid) to authenticated;
