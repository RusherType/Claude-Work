-- CD-004: workspaces, invitations and roles (docs/03-security.md, docs/05-app-flow.md Flow F).
-- Also closes direct client writes on tables whose rows must come from server code (CD-005 audit):
-- once users can create workspaces, every remaining write policy is reachable via the Data API.

-- ============ Lock down: server- or job-written tables ============
-- Each later ticket adds the server path (RPC or service role) it needs:
--   integrations (CD-020), classifications (CD-032/CD-041), agent_questions (CD-034),
--   alerts/alert_items (CD-061), documents (CD-070/071), broker_orders (CD-080), api_keys (CD-114).
drop policy integrations_write on integrations;
drop policy broker_orders_write on broker_orders;
drop policy api_keys_write on api_keys;
drop policy classifications_write on classifications;
drop policy agent_questions_write on agent_questions;
drop policy alerts_write on alerts;
drop policy alert_items_write on alert_items;
drop policy documents_write on documents;
drop policy audit_insert on audit_log;
revoke insert, update, delete on integrations, broker_orders, api_keys, classifications,
  agent_questions, alerts, alert_items, documents, audit_log from anon, authenticated;

-- Members join only by accepting an invitation (or by creating the workspace).
revoke insert on memberships from anon, authenticated;
drop policy mem_admin_insert on memberships;
-- Anyone may leave a workspace (the deferred owner trigger still keeps one owner).
create policy mem_self_delete on memberships for delete
  using (user_id = auth.uid() and is_member(workspace_id));

-- Deleting a workspace is a soft delete with a 7-day grace period (docs/05-app-flow.md Flow F),
-- done by the server after an owner check; clients never hard-delete.
drop policy ws_delete on workspaces;
revoke delete on workspaces from anon, authenticated;

-- quotes.created_by is always the signed-in user.
create or replace function set_created_by() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
create trigger quotes_created_by before insert or update on quotes
for each row execute function set_created_by();

-- ============ Invitations ============
create table invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  email text not null check (email = lower(email) and length(email) between 3 and 254),
  role member_role not null,
  token_hash text not null unique,
  invited_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users on delete set null,
  revoked_at timestamptz,
  unique (workspace_id, id)
);
create unique index invitations_one_open on invitations (workspace_id, email)
  where accepted_at is null and revoked_at is null;

alter table invitations enable row level security;
create policy invitations_select on invitations for select
  using (has_role(workspace_id, array['owner','admin']::member_role[]));
-- Owners and admins see invitations but never the token hash; all writes go through functions.
revoke all on invitations from anon, authenticated;
grant select (id, workspace_id, email, role, invited_by, created_at, expires_at, accepted_at,
  revoked_at) on invitations to authenticated;

-- ============ Audit trail for memberships ============
create or replace function audit_membership_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ws uuid := coalesce(new.workspace_id, old.workspace_id);
begin
  -- Skip when the whole workspace is being deleted (its audit rows go with it).
  if not exists (select 1 from public.workspaces w where w.id = ws) then
    return null;
  end if;
  insert into public.audit_log (workspace_id, actor_id, action, entity, entity_id, data)
  values (
    ws, auth.uid(), 'membership.' || lower(tg_op), 'membership',
    coalesce(new.user_id, old.user_id),
    jsonb_build_object('old_role', old.role, 'new_role', new.role)
  );
  return null;
end $$;
create trigger memberships_audit after insert or update or delete on memberships
for each row execute function audit_membership_change();

-- ============ Functions (called by server actions with the user's session) ============
-- Errors: 42501 not allowed, 22023 invalid input, P0001 with a message code for invitation states.

create or replace function create_workspace(
  p_name text, p_home_country text, p_business_type text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ws uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_home_country is null or p_home_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid_country' using errcode = '22023';
  end if;
  if p_business_type is not null and p_business_type not in ('dtc_to_us', 'importer', 'both') then
    raise exception 'invalid_business_type' using errcode = '22023';
  end if;
  if (select count(*) from public.memberships m where m.user_id = uid and m.role = 'owner') >= 20 then
    raise exception 'too_many_workspaces' using errcode = '22023';
  end if;

  insert into public.workspaces (name, home_country, business_type)
  values (btrim(p_name), p_home_country, p_business_type)
  returning id into ws;
  insert into public.memberships (workspace_id, user_id, role) values (ws, uid, 'owner');
  insert into public.audit_log (workspace_id, actor_id, action, entity, entity_id)
  values (ws, uid, 'workspace.create', 'workspace', ws);
  return ws;
end $$;

-- Returns the plain token once; only its SHA-256 hash is stored.
create or replace function create_invitation(p_workspace uuid, p_email text, p_role member_role)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  addr text := lower(btrim(coalesce(p_email, '')));
  token text;
  inv uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.has_role(p_workspace, array['owner','admin']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role = 'owner' and not public.has_role(p_workspace, array['owner']::public.member_role[]) then
    raise exception 'only_owners_invite_owners' using errcode = '42501';
  end if;
  if exists (select 1 from public.workspaces w where w.id = p_workspace and w.deleted_at is not null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(addr) > 254 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.memberships m join auth.users u on u.id = m.user_id
    where m.workspace_id = p_workspace and lower(u.email) = addr
  ) then
    raise exception 'already_member' using errcode = '22023';
  end if;
  if (select count(*) from public.invitations i
      where i.workspace_id = p_workspace and i.accepted_at is null and i.revoked_at is null
        and i.expires_at > now()) >= 200 then
    raise exception 'too_many_invitations' using errcode = '22023';
  end if;

  -- Only an owner may replace an open owner invitation.
  if exists (
    select 1 from public.invitations i
    where i.workspace_id = p_workspace and i.email = addr and i.role = 'owner'
      and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  ) and not public.has_role(p_workspace, array['owner']::public.member_role[]) then
    raise exception 'only_owners_invite_owners' using errcode = '42501';
  end if;

  -- A new invitation replaces any open one for the same address.
  update public.invitations set revoked_at = now()
  where workspace_id = p_workspace and email = addr and accepted_at is null and revoked_at is null;

  token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.invitations (workspace_id, email, role, token_hash, invited_by)
  values (p_workspace, addr, p_role, encode(sha256(convert_to(token, 'UTF8')), 'hex'), uid)
  returning id into inv;
  insert into public.audit_log (workspace_id, actor_id, action, entity, entity_id, data)
  values (p_workspace, uid, 'invitation.create', 'invitation', inv,
          jsonb_build_object('role', p_role));
  return token;
end $$;

create or replace function accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inv public.invitations;
  user_email text;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into inv from public.invitations
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;
  if inv.id is null or inv.revoked_at is not null or inv.accepted_at is not null then
    raise exception 'invitation_invalid';
  end if;
  if inv.expires_at < now() then raise exception 'invitation_expired'; end if;
  -- The workspace must still exist, and the inviter must still hold the role needed to invite
  -- (removing or demoting someone also cancels what they sent).
  if exists (select 1 from public.workspaces w where w.id = inv.workspace_id and w.deleted_at is not null)
     or inv.invited_by is null
     or not exists (
       -- FOR SHARE waits for a concurrent removal or demotion of the inviter to commit.
       select 1 from public.memberships m
       where m.workspace_id = inv.workspace_id and m.user_id = inv.invited_by
         and m.role = any (case when inv.role = 'owner' then array['owner']::public.member_role[]
                                else array['owner','admin']::public.member_role[] end)
       for share
     ) then
    raise exception 'invitation_invalid';
  end if;

  select lower(u.email) into user_email from auth.users u
  where u.id = uid and u.email_confirmed_at is not null;
  if user_email is null or user_email <> inv.email then
    raise exception 'invitation_wrong_email';
  end if;

  insert into public.memberships (workspace_id, user_id, role)
  values (inv.workspace_id, uid, inv.role)
  on conflict (workspace_id, user_id) do nothing;
  update public.invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  insert into public.audit_log (workspace_id, actor_id, action, entity, entity_id)
  values (inv.workspace_id, uid, 'invitation.accept', 'invitation', inv.id);
  return inv.workspace_id;
end $$;

create or replace function revoke_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ws uuid;
  inv_role public.member_role;
  changed int;
begin
  select workspace_id, role into ws, inv_role from public.invitations where id = p_invitation;
  if ws is null or not public.has_role(ws, array['owner','admin']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Admins never manage owners, including owner invitations.
  if inv_role = 'owner' and not public.has_role(ws, array['owner']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.invitations set revoked_at = now()
  where id = p_invitation and accepted_at is null and revoked_at is null;
  get diagnostics changed = row_count;
  if changed > 0 then
    insert into public.audit_log (workspace_id, actor_id, action, entity, entity_id)
    values (ws, auth.uid(), 'invitation.revoke', 'invitation', p_invitation);
  end if;
end $$;

-- Team list with emails (auth.users is not readable by clients). Members of the workspace only.
create or replace function workspace_members(p_workspace uuid)
returns table (user_id uuid, email text, full_name text, role public.member_role)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(p_workspace) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, p.full_name, m.role
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.workspace_id = p_workspace
    order by m.role, u.email;
end $$;

-- Only signed-in users may call these; anon never.
revoke execute on function create_workspace(text, text, text), create_invitation(uuid, text, member_role),
  accept_invitation(text), revoke_invitation(uuid), workspace_members(uuid) from public, anon;
grant execute on function create_workspace(text, text, text), create_invitation(uuid, text, member_role),
  accept_invitation(text), revoke_invitation(uuid), workspace_members(uuid) to authenticated;
-- Trigger functions are not callable directly.
revoke execute on function set_created_by(), audit_membership_change(), ensure_workspace_has_owner(),
  handle_new_user() from public, anon, authenticated;

-- Keep new tables free of TRUNCATE/TRIGGER/REFERENCES for API roles (see 0001).
revoke truncate, trigger, references on invitations from anon, authenticated;

-- ============ Hardening from the CD-004 security audit ============
-- RLS helpers: never resolve unqualified names through search_path (a temp table could shadow
-- memberships). Same signatures, so every policy keeps working.
create or replace function is_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships where workspace_id = ws and user_id = auth.uid());
$$;

create or replace function has_role(ws uuid, roles member_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships
                 where workspace_id = ws and user_id = auth.uid() and role = any(roles));
$$;

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false);
$$;

-- A content change on a product marks its confirmed classifications outdated. Clients cannot
-- write classifications since the lockdown, so this runs as the table owner.
create or replace function mark_outdated_on_edit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.content_hash is distinct from old.content_hash then
    update public.classifications set status = 'outdated'
    where product_id = new.id and workspace_id = new.workspace_id and is_current
      and status in ('confirmed', 'broker_verified');
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Deleting a product would cascade into compliance records clients cannot touch directly
-- (confirmed codes, broker orders). Clients must keep such products; jobs and the service role
-- (auth.uid() is null) are not limited.
create or replace function protect_product_records() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and (
    exists (select 1 from public.broker_orders b where b.product_id = old.id and b.workspace_id = old.workspace_id)
    -- Any code a person ever confirmed or overrode, or a broker verified, whatever its status now
    -- (a content edit turns confirmed codes into 'outdated').
    or exists (select 1 from public.classifications c
               where c.product_id = old.id and c.workspace_id = old.workspace_id
                 and (c.confirmed_at is not null or c.source in ('override', 'broker')
                      or c.status in ('confirmed', 'broker_verified', 'outdated')))
  ) then
    raise exception 'product_has_records' using errcode = '23503';
  end if;
  return old;
end $$;
create trigger products_protect_records before delete on products
for each row execute function protect_product_records();

revoke execute on function mark_outdated_on_edit(), protect_product_records()
  from public, anon, authenticated;

-- Writes that only missing policies were blocking: remove the grants too.
revoke insert, update, delete on agent_runs, subscriptions, tariff_revisions, tariff_lines,
  rulings, ruling_chunks, fee_schedules from anon, authenticated;
revoke insert, delete on profiles, workspaces from anon, authenticated;
