-- ClearDuty initial schema (docs/06-schema.md)
create extension if not exists vector;
create extension if not exists pg_trgm;

create type member_role as enum ('owner','admin','member','viewer');
create type class_status as enum ('queued','needs_answer','in_review','suggested','confirmed','broker_verified','outdated');
create type class_source as enum ('ai','override','broker');
create type market_code as enum ('US','UK','EU','CA','AU');

-- ============ Tenancy ============
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  home_country char(2) not null,
  business_type text check (business_type in ('dtc_to_us','importer','both')),
  default_origin char(2),
  default_mode text check (default_mode in ('postal','express','ocean','air')),
  default_incoterm text check (default_incoterm in ('DDP','DAP')),
  created_at timestamptz default now(),
  deleted_at timestamptz
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  is_platform_admin boolean default false
);

create table memberships (
  workspace_id uuid references workspaces on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role member_role not null default 'member',
  primary key (workspace_id, user_id)
);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  provider text not null check (provider in ('shopify','csv','api')),
  shop_domain text,
  access_token_secret_id uuid, -- Supabase Vault secret id
  status text default 'active',
  last_synced_at timestamptz,
  unique (provider, shop_domain),
  unique (workspace_id, id)
);

-- ============ Catalog ============
create table products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  integration_id uuid,
  external_id text,
  sku text,
  title text not null,
  description text,
  product_type text,
  vendor text,
  tags text[],
  image_urls text[],
  origin_country char(2),
  customs_value numeric(12,2),
  currency char(3) default 'USD',
  weight_kg numeric(10,3),
  facts jsonb default '{}',
  content_hash text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (workspace_id, integration_id, external_id),
  unique (workspace_id, id),
  foreign key (workspace_id, integration_id) references integrations (workspace_id, id)
    on delete set null (integration_id)
);
create index on products (workspace_id, sku);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  product_id uuid,
  market market_code not null default 'US',
  model text not null,
  prompt_version text not null,
  tool_calls jsonb default '[]',
  output jsonb,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,5),
  error text,
  started_at timestamptz default now(),
  finished_at timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, product_id) references products (workspace_id, id) on delete cascade
);

create table classifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  product_id uuid not null,
  market market_code not null default 'US',
  code text,
  tariff_revision_id uuid,
  status class_status not null default 'queued',
  source class_source not null default 'ai',
  confidence numeric(3,2),
  gri_path jsonb,
  reasoning text,
  alternatives jsonb,
  citations jsonb,
  agent_run_id uuid,
  override_reason text,
  confirmed_by uuid references auth.users,
  confirmed_at timestamptz,
  is_current boolean default true,
  created_at timestamptz default now(),
  foreign key (workspace_id, product_id) references products (workspace_id, id) on delete cascade,
  foreign key (workspace_id, agent_run_id) references agent_runs (workspace_id, id)
);
create unique index one_current_class on classifications (product_id, market) where is_current;

create table agent_questions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  product_id uuid not null,
  agent_run_id uuid,
  question text not null,
  options jsonb,
  answer text,
  answered_by uuid references auth.users,
  answered_at timestamptz,
  foreign key (workspace_id, product_id) references products (workspace_id, id) on delete cascade,
  foreign key (workspace_id, agent_run_id) references agent_runs (workspace_id, id)
);

-- ============ Shared reference data ============
create table tariff_revisions (
  id uuid primary key default gen_random_uuid(),
  market market_code not null,
  label text not null,
  effective_from date not null,
  source_url text,
  imported_at timestamptz default now(),
  unique (market, label)
);

create table tariff_lines (
  id bigserial primary key,
  revision_id uuid not null references tariff_revisions on delete cascade,
  code text not null,
  indent int not null,
  description text not null,
  full_path text,
  general_rate_raw text,
  special_rate_raw text,
  column2_rate_raw text,
  rate jsonb,
  units text[],
  footnotes jsonb,
  is_leaf boolean not null,
  embedding vector(1024),
  unique (revision_id, code, indent, description)
);
create index on tariff_lines using hnsw (embedding vector_cosine_ops);
create index on tariff_lines using gin (description gin_trgm_ops);

create table rulings (
  number text primary key,
  collection text check (collection in ('HQ','NY')),
  ruling_date date,
  subject text,
  hts_codes text[],
  status text default 'active',
  url text,
  full_text text
);

create table ruling_chunks (
  id bigserial primary key,
  ruling_number text references rulings on delete cascade,
  chunk text not null,
  embedding vector(1024)
);
create index on ruling_chunks using hnsw (embedding vector_cosine_ops);

create table tariff_measures (
  id uuid primary key default gen_random_uuid(),
  market market_code not null,
  authority text not null,
  ch99_code text,
  hts_prefixes text[] not null,
  excluded_prefixes text[] default '{}',
  origin_countries char(2)[] not null, -- '{**}' means all origins
  rate_type text check (rate_type in ('ad_valorem','specific','flat_per_item')),
  rate_value numeric(10,4) not null,
  applies_to_modes text[] default '{postal,express,ocean,air}',
  effective_from date not null,
  effective_to date,
  source_url text not null,
  notes text,
  published boolean default false,
  created_by uuid references auth.users
);

create table fee_schedules (
  id uuid primary key default gen_random_uuid(),
  market market_code not null,
  fee_type text not null,
  mode text,
  carrier text,
  pct numeric(8,5),
  flat_amount numeric(10,2),
  min_amount numeric(10,2),
  max_amount numeric(10,2),
  effective_from date not null,
  effective_to date,
  source_url text
);

-- ============ Outputs ============
create table quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  name text,
  origin char(2),
  mode text,
  destination market_code default 'US',
  totals jsonb,
  created_by uuid references auth.users,
  created_at timestamptz default now(),
  unique (workspace_id, id)
);

create table quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null,
  workspace_id uuid not null references workspaces on delete cascade,
  product_id uuid,
  quantity int not null,
  unit_value numeric(12,2),
  code_used text,
  used_suggested boolean default false,
  breakdown jsonb,
  foreign key (workspace_id, quote_id) references quotes (workspace_id, id) on delete cascade,
  foreign key (workspace_id, product_id) references products (workspace_id, id)
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  kind text check (kind in ('new_measure','rate_change','revision','product_edit')),
  title text not null,
  body text,
  measure_id uuid references tariff_measures,
  effective_from date,
  read_at timestamptz,
  created_at timestamptz default now(),
  unique (workspace_id, id)
);

create table alert_items (
  alert_id uuid,
  workspace_id uuid not null references workspaces on delete cascade,
  product_id uuid,
  cost_before numeric(12,2),
  cost_after numeric(12,2),
  primary key (alert_id, product_id),
  foreign key (workspace_id, alert_id) references alerts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, product_id) references products (workspace_id, id) on delete cascade
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  kind text check (kind in ('commercial_invoice','classification_sheet')),
  storage_path text not null,
  meta jsonb,
  created_by uuid references auth.users,
  created_at timestamptz default now()
);

create table broker_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  product_id uuid not null,
  broker_name text,
  status text default 'requested',
  price_usd numeric(8,2),
  stripe_payment_intent text,
  verified_code text,
  broker_notes text,
  created_at timestamptz default now(),
  completed_at timestamptz,
  foreign key (workspace_id, product_id) references products (workspace_id, id) on delete cascade
);

create table subscriptions (
  workspace_id uuid primary key references workspaces on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text check (plan in ('trial','starter','growth','pro')) default 'trial',
  sku_limit int default 100,
  status text,
  trial_ends_at timestamptz,
  current_period_end timestamptz
);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  name text,
  key_hash text not null unique,
  prefix text not null,
  scope text check (scope in ('read','read_write')) default 'read',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now()
);

create table audit_log (
  id bigserial primary key,
  workspace_id uuid not null references workspaces on delete cascade,
  actor_id uuid,
  action text not null,
  entity text,
  entity_id uuid,
  data jsonb,
  created_at timestamptz default now()
);

-- ============ RLS helpers ============
create or replace function is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where workspace_id = ws and user_id = auth.uid());
$$;

create or replace function has_role(ws uuid, roles member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where workspace_id = ws and user_id = auth.uid() and role = any(roles));
$$;

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from profiles where id = auth.uid()), false);
$$;

-- ============ RLS: workspaces, memberships, profiles ============
alter table workspaces enable row level security;
create policy ws_select on workspaces for select using (is_member(id));
create policy ws_update on workspaces for update using (has_role(id, array['owner','admin']::member_role[]));
create policy ws_delete on workspaces for delete using (has_role(id, array['owner']::member_role[]));
-- deleted_at (soft delete, docs/05-app-flow.md Flow F) is set by the server after an owner check.
revoke update on workspaces from anon, authenticated;
grant update (name, home_country, business_type, default_origin, default_mode, default_incoterm)
  on workspaces to authenticated;
-- inserts go through a server action that creates the workspace and the owner membership together

alter table memberships enable row level security;
create policy mem_select on memberships for select using (is_member(workspace_id));
-- Owners manage every membership. Admins manage non-owner memberships only, so they can never
-- grant, change or remove the owner role (docs/03-security.md: "Yes (not owners)").
create policy mem_owner_write on memberships for all
  using (has_role(workspace_id, array['owner']::member_role[]))
  with check (has_role(workspace_id, array['owner']::member_role[]));
create policy mem_admin_insert on memberships for insert
  with check (has_role(workspace_id, array['admin']::member_role[]) and role <> 'owner');
create policy mem_admin_update on memberships for update
  using (has_role(workspace_id, array['admin']::member_role[]) and role <> 'owner')
  with check (has_role(workspace_id, array['admin']::member_role[]) and role <> 'owner');
create policy mem_admin_delete on memberships for delete
  using (has_role(workspace_id, array['admin']::member_role[]) and role <> 'owner');
-- A membership's workspace and user never change; only its role does.
revoke update on memberships from anon, authenticated;
grant update (role) on memberships to authenticated;

-- A workspace must always keep at least one owner (checked at commit, so ownership can be
-- handed over within one transaction; skipped when the workspace itself is being deleted).
create or replace function ensure_workspace_has_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner'
     and exists (select 1 from public.workspaces w where w.id = old.workspace_id)
     and not exists (select 1 from public.memberships m
                     where m.workspace_id = old.workspace_id and m.role = 'owner') then
    raise exception 'A workspace must keep at least one owner' using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger memberships_keep_owner
  after update or delete on memberships
  deferrable initially deferred
  for each row execute function ensure_workspace_has_owner();

alter table profiles enable row level security;
create policy prof_self on profiles for select using (id = auth.uid());
create policy prof_self_update on profiles for update using (id = auth.uid())
  with check (id = auth.uid() and is_platform_admin = (select p.is_platform_admin from profiles p where p.id = auth.uid()));

-- ============ RLS: tenant tables (members read; owner/admin/member write) ============
do $$
declare t text;
begin
  foreach t in array array[
    'products','classifications','agent_questions','quotes','quote_lines',
    'alerts','alert_items','documents'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (is_member(workspace_id))', t || '_select', t);
    execute format($p$create policy %I on %I for all
      using (has_role(workspace_id, array['owner','admin','member']::member_role[]))
      with check (has_role(workspace_id, array['owner','admin','member']::member_role[]))$p$, t || '_write', t);
  end loop;
end $$;

-- Owner/admin only for integrations, broker orders, API keys
do $$
declare t text;
begin
  foreach t in array array['integrations','broker_orders','api_keys'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (is_member(workspace_id))', t || '_select', t);
    execute format($p$create policy %I on %I for all
      using (has_role(workspace_id, array['owner','admin']::member_role[]))
      with check (has_role(workspace_id, array['owner','admin']::member_role[]))$p$, t || '_write', t);
  end loop;
end $$;

-- agent_runs and subscriptions: read by members, written only by the service role (jobs, Stripe webhooks)
alter table agent_runs enable row level security;
create policy agent_runs_select on agent_runs for select using (is_member(workspace_id));
alter table subscriptions enable row level security;
create policy subs_select on subscriptions for select using (is_member(workspace_id));

-- audit_log: insert and select only, never update or delete
alter table audit_log enable row level security;
create policy audit_select on audit_log for select using (is_member(workspace_id));
create policy audit_insert on audit_log for insert
  with check (is_member(workspace_id) and actor_id = auth.uid());

-- ============ RLS: shared reference data ============
do $$
declare t text;
begin
  foreach t in array array['tariff_revisions','tariff_lines','rulings','ruling_chunks','fee_schedules'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_read', t);
  end loop;
end $$;

alter table tariff_measures enable row level security;
create policy measures_read on tariff_measures for select to authenticated using (published or is_platform_admin());
create policy measures_admin on tariff_measures for all using (is_platform_admin()) with check (is_platform_admin());

-- ============ Functions ============
create or replace function current_revision(m market_code) returns uuid
language sql stable as $$
  select id from tariff_revisions where market = m order by effective_from desc, imported_at desc limit 1;
$$;

create or replace function match_tariff_lines(query_embedding vector(1024), rev uuid, k int default 10)
returns table (id bigint, code text, description text, full_path text, is_leaf boolean, similarity float)
language sql stable as $$
  select id, code, description, full_path, is_leaf, 1 - (embedding <=> query_embedding)
  from tariff_lines where revision_id = rev and embedding is not null
  order by embedding <=> query_embedding limit least(greatest(k, 1), 50);
$$;

create or replace function match_rulings(query_embedding vector(1024), hts_prefix text default null, k int default 8)
returns table (ruling_number text, chunk text, similarity float)
language sql stable as $$
  select c.ruling_number, c.chunk, 1 - (c.embedding <=> query_embedding)
  from ruling_chunks c join rulings r on r.number = c.ruling_number
  where r.status <> 'revoked'
    and (hts_prefix is null or exists (select 1 from unnest(r.hts_codes) h where h like hts_prefix || '%'))
  order by c.embedding <=> query_embedding limit least(greatest(k, 1), 50);
$$;

create or replace function active_measures(p_code text, p_origin char(2), p_mode text, p_on date)
returns setof tariff_measures
language sql stable as $$
  select * from tariff_measures m
  where m.published
    and p_on >= m.effective_from and (m.effective_to is null or p_on <= m.effective_to)
    and exists (select 1 from unnest(m.hts_prefixes) pfx where p_code like pfx || '%')
    and not exists (select 1 from unnest(m.excluded_prefixes) ex where p_code like ex || '%')
    and ('**' = any(m.origin_countries) or p_origin = any(m.origin_countries))
    and p_mode = any(m.applies_to_modes);
$$;

-- Mark confirmed classifications outdated when the product's content changes
create or replace function mark_outdated_on_edit() returns trigger
language plpgsql as $$
begin
  if new.content_hash is distinct from old.content_hash then
    update classifications set status = 'outdated'
    where product_id = new.id and is_current and status in ('confirmed','broker_verified');
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger products_outdated before update on products
for each row execute function mark_outdated_on_edit();

-- ============ Auth ============
-- Every new auth user gets a profile row (CD-003). Runs as the table owner; the user cannot set
-- is_platform_admin through sign-up metadata.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(new.raw_user_meta_data ->> 'full_name', 200))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();
