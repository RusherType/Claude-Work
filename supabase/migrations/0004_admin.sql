-- CD-014: admin editors for tariff measures, fees and special programs.
--
-- 1. Platform admins write reference data only with a second factor (aal2 session).
-- 2. Rows are drafts until published. A published row is never edited or deleted: it can only be
--    end-dated. A change is a new row, so saved quotes and alerts keep pointing at what applied.
-- 3. Value checks so the landed-cost engine never receives a row it must reject.
-- 4. special_programs (eligibility from the HTSUS General Notes) and
--    tariff_measures.exempt_programs, which the engine already reads (docs/06-schema.md).
-- 5. Every change to these tables is written to reference_audit.

-- ============ 1. admin with a second factor ============
create or replace function is_platform_admin_mfa() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin()
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- ============ 4. special programs ============
create table special_programs (
  id uuid primary key default gen_random_uuid(),
  market market_code not null default 'US',
  symbol text not null check (symbol ~ '^[A-Z0-9]{1,3}[+*]?$'),
  name text not null check (char_length(name) between 1 and 200),
  countries char(2)[] not null check (
    cardinality(countries) between 1 and 300
    and array_to_string(countries, ',') ~ '^[A-Z]{2}(,[A-Z]{2})*$'
  ),
  mpf_exempt boolean not null,
  effective_from date not null,
  effective_to date,
  source_url text not null,
  notes text,
  published boolean not null default false,
  published_at timestamptz,
  published_by uuid references auth.users,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

alter table tariff_measures
  add column exempt_programs text[],
  add column published_at timestamptz,
  add column published_by uuid references auth.users,
  add column created_at timestamptz not null default now();
alter table tariff_measures alter column created_by set default auth.uid();

alter table fee_schedules
  add column notes text,
  add column published boolean not null default false,
  add column published_at timestamptz,
  add column published_by uuid references auth.users,
  add column created_by uuid references auth.users default auth.uid(),
  add column created_at timestamptz not null default now();

-- Rows that existed before publishing was introduced were already live.
update fee_schedules set published = true;

-- ============ 3. value checks ============
update tariff_measures set excluded_prefixes = '{}' where excluded_prefixes is null;
update tariff_measures set applies_to_modes = '{postal,express,ocean,air}' where applies_to_modes is null;
alter table tariff_measures
  alter column excluded_prefixes set not null,
  alter column applies_to_modes set not null,
  alter column rate_type set not null,
  alter column published set not null,
  add constraint measures_authority check (char_length(authority) between 1 and 200),
  add constraint measures_ch99 check (ch99_code is null or ch99_code ~ '^99[0-9]{2}\.[0-9]{2}\.[0-9]{2}$'),
  add constraint measures_prefixes check (
    cardinality(hts_prefixes) between 1 and 5000
    and array_to_string(hts_prefixes, ',') ~ '^[0-9]{2,10}(,[0-9]{2,10})*$'),
  add constraint measures_excluded check (
    cardinality(excluded_prefixes) <= 5000
    and (cardinality(excluded_prefixes) = 0
         or array_to_string(excluded_prefixes, ',') ~ '^[0-9]{2,10}(,[0-9]{2,10})*$')),
  add constraint measures_origins check (
    cardinality(origin_countries) between 1 and 300
    and array_to_string(origin_countries, ',') ~ '^([A-Z]{2}|\*\*)(,([A-Z]{2}|\*\*))*$'),
  add constraint measures_modes check (
    cardinality(applies_to_modes) >= 1
    and applies_to_modes <@ array['postal','express','ocean','air']),
  add constraint measures_exempt check (
    exempt_programs is null or cardinality(exempt_programs) = 0
    or array_to_string(exempt_programs, ',') ~ '^[A-Z0-9]{1,3}[+*]?(,[A-Z0-9]{1,3}[+*]?)*$'),
  add constraint measures_rate check (rate_value >= 0),
  add constraint measures_dates check (effective_to is null or effective_to >= effective_from),
  add constraint measures_source check (source_url ~ '^https://');

alter table fee_schedules
  add constraint fees_type check (fee_type in
    ('mpf_formal','mpf_informal','hmf','carrier_brokerage','informal_entry_limit')),
  add constraint fees_mode check (mode is null or mode in ('postal','express','ocean','air')),
  add constraint fees_carrier check (carrier is null or char_length(trim(carrier)) between 1 and 100),
  add constraint fees_amount check (
    case when fee_type = 'informal_entry_limit' then flat_amount is not null
         else pct is not null or flat_amount is not null end),
  add constraint fees_nonnegative check (
    coalesce(pct, 0) >= 0 and coalesce(flat_amount, 0) >= 0
    and coalesce(min_amount, 0) >= 0 and coalesce(max_amount, 0) >= 0),
  add constraint fees_min_max check (min_amount is null or max_amount is null or min_amount <= max_amount),
  add constraint fees_dates check (effective_to is null or effective_to >= effective_from),
  add constraint fees_source check (
    (source_url is null and not published) or source_url ~ '^https://');

-- ============ 2. publishing rules ============
-- Runs as the caller. Drafts can be edited freely; publishing stamps who and when; a published
-- row only accepts an end date (once, never before its start) and can never be unpublished or
-- deleted by a signed-in user. Server jobs and maintenance (no signed-in user, e.g. the service
-- role) are not limited, like protect_product_records.
create or replace function guard_reference_row() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if old.published then
      raise exception 'published_rows_are_permanent' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.published_at := null;
    new.published_by := null;
    if new.published then
      new.published_at := now();
      new.published_by := auth.uid();
    end if;
    return new;
  end if;

  if old.published then
    v_old := to_jsonb(old) - 'effective_to';
    v_new := to_jsonb(new) - 'effective_to';
    if v_old is distinct from v_new or old.effective_to is not null then
      raise exception 'published_rows_are_permanent' using errcode = '42501';
    end if;
    return new;
  end if;

  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.published_at := null;
  new.published_by := null;
  if new.published then
    new.published_at := now();
    new.published_by := auth.uid();
  end if;
  return new;
end $$;

revoke execute on function guard_reference_row() from public, anon, authenticated;

create trigger tariff_measures_guard before insert or update or delete on tariff_measures
for each row execute function guard_reference_row();
create trigger fee_schedules_guard before insert or update or delete on fee_schedules
for each row execute function guard_reference_row();
create trigger special_programs_guard before insert or update or delete on special_programs
for each row execute function guard_reference_row();

-- ============ 5. audit ============
create table reference_audit (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('insert','update','delete')),
  actor_id uuid,
  old_row jsonb,
  new_row jsonb,
  at timestamptz not null default now()
);

create or replace function audit_reference_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.reference_audit (table_name, row_id, action, actor_id, old_row, new_row)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    lower(tg_op),
    auth.uid(),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end $$;

revoke execute on function audit_reference_change() from public, anon, authenticated;

create trigger tariff_measures_audit after insert or update or delete on tariff_measures
for each row execute function audit_reference_change();
create trigger fee_schedules_audit after insert or update or delete on fee_schedules
for each row execute function audit_reference_change();
create trigger special_programs_audit after insert or update or delete on special_programs
for each row execute function audit_reference_change();

-- ============ 1. policies and grants ============
alter table special_programs enable row level security;
alter table reference_audit enable row level security;

drop policy measures_read on tariff_measures;
drop policy measures_admin on tariff_measures;
drop policy fee_schedules_read on fee_schedules;

create policy measures_read on tariff_measures for select to authenticated
  using (published or is_platform_admin_mfa());
create policy fee_schedules_read on fee_schedules for select to authenticated
  using (published or is_platform_admin_mfa());
create policy special_programs_read on special_programs for select to authenticated
  using (published or is_platform_admin_mfa());
create policy reference_audit_read on reference_audit for select to authenticated
  using (is_platform_admin_mfa());

create policy measures_admin_insert on tariff_measures for insert to authenticated
  with check (is_platform_admin_mfa());
create policy measures_admin_update on tariff_measures for update to authenticated
  using (is_platform_admin_mfa()) with check (is_platform_admin_mfa());
create policy measures_admin_delete on tariff_measures for delete to authenticated
  using (is_platform_admin_mfa());
create policy fee_schedules_admin_insert on fee_schedules for insert to authenticated
  with check (is_platform_admin_mfa());
create policy fee_schedules_admin_update on fee_schedules for update to authenticated
  using (is_platform_admin_mfa()) with check (is_platform_admin_mfa());
create policy fee_schedules_admin_delete on fee_schedules for delete to authenticated
  using (is_platform_admin_mfa());
create policy special_programs_admin_insert on special_programs for insert to authenticated
  with check (is_platform_admin_mfa());
create policy special_programs_admin_update on special_programs for update to authenticated
  using (is_platform_admin_mfa()) with check (is_platform_admin_mfa());
create policy special_programs_admin_delete on special_programs for delete to authenticated
  using (is_platform_admin_mfa());

-- Grants open only what the policies allow: anon sees no rows (no anon policy), signed-in users
-- read published rows, and only an admin with a second factor writes.
revoke all on tariff_measures, fee_schedules, special_programs, reference_audit from anon, authenticated;
grant select on tariff_measures, fee_schedules, special_programs, reference_audit to anon;
grant select, insert, update, delete on tariff_measures, fee_schedules, special_programs to authenticated;
grant select on reference_audit to authenticated;
