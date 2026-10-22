-- ClearDuty 0002: profiles on signup, workspace creation, invitations, role rules (CD-003, CD-004)
-- See docs/06-schema.md and docs/03-security.md.

-- ============ Profiles: one row per auth user ============
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- is_platform_admin is set by the service role only, never by the user
revoke update on profiles from authenticated, anon;
grant update (full_name) on profiles to authenticated;

-- ============ Memberships: admins cannot touch owners; a workspace always keeps an owner ============
drop policy mem_write on memberships;
-- No insert policy: rows are created only by create_workspace() and accept_invitation().
create policy mem_update on memberships for update
  using (has_role(workspace_id, array['owner']::member_role[])
         or (has_role(workspace_id, array['admin']::member_role[]) and role <> 'owner'))
  with check (has_role(workspace_id, array['owner']::member_role[])
              or (has_role(workspace_id, array['admin']::member_role[]) and role <> 'owner'));
create policy mem_delete on memberships for delete
  using (has_role(workspace_id, array['owner']::member_role[])
         or (has_role(workspace_id, array['admin']::member_role[]) and role <> 'owner')
         or (user_id = auth.uid() and role <> 'owner'));

create or replace function keep_one_owner() returns trigger
language plpgsql as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    if not exists (select 1 from memberships
                   where workspace_id = old.workspace_id and role = 'owner' and user_id <> old.user_id) then
      -- Cascading deletes of the whole workspace are allowed
      if exists (select 1 from workspaces where id = old.workspace_id) then
        raise exception 'A workspace must keep at least one owner' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger memberships_keep_owner before update or delete on memberships
for each row execute function keep_one_owner();

-- ============ Audit log: the actor is always the caller ============
drop policy audit_insert on audit_log;
create policy audit_insert on audit_log for insert
  with check (is_member(workspace_id) and actor_id = auth.uid());

-- ============ Workspace creation ============
create or replace function create_workspace(
  p_name text,
  p_home_country char(2),
  p_business_type text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'Workspace name must be 1 to 80 characters' using errcode = '22023';
  end if;
  if p_home_country !~ '^[A-Z]{2}$' then
    raise exception 'Home country must be a 2-letter ISO code' using errcode = '22023';
  end if;

  insert into workspaces (name, home_country, business_type)
  values (trim(p_name), p_home_country, p_business_type)
  returning id into ws;

  insert into memberships (workspace_id, user_id, role) values (ws, uid, 'owner');
  insert into audit_log (workspace_id, actor_id, action, entity, entity_id, data)
  values (ws, uid, 'workspace.created', 'workspace', ws, jsonb_build_object('name', trim(p_name)));
  return ws;
end $$;

-- ============ Invitations ============
create table invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role member_role not null default 'member' check (role <> 'owner'),
  token_hash text not null unique, -- sha256 hex of the token in the invite link; the token itself is never stored
  invited_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users on delete set null,
  revoked_at timestamptz
);
create unique index invitations_one_open on invitations (workspace_id, email)
  where accepted_at is null and revoked_at is null;

alter table invitations enable row level security;
create policy invitations_select on invitations for select
  using (has_role(workspace_id, array['owner','admin']::member_role[]));
create policy invitations_insert on invitations for insert
  with check (has_role(workspace_id, array['owner','admin']::member_role[]) and invited_by = auth.uid());
create policy invitations_update on invitations for update
  using (has_role(workspace_id, array['owner','admin']::member_role[]))
  with check (has_role(workspace_id, array['owner','admin']::member_role[]));

-- Accept an invite: the signed-in user's email must match the invited email.
create or replace function accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv invitations%rowtype;
  uid uuid := auth.uid();
  user_email text;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select lower(email) into user_email from auth.users where id = uid;

  select * into inv from invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found or inv.revoked_at is not null or inv.expires_at < now() then
    raise exception 'This invitation is invalid or has expired' using errcode = 'P0002';
  end if;
  if inv.accepted_at is not null then
    if inv.accepted_by = uid then
      return inv.workspace_id; -- clicking the link twice is fine
    end if;
    raise exception 'This invitation has already been used' using errcode = 'P0002';
  end if;
  if inv.email <> user_email then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;

  insert into memberships (workspace_id, user_id, role)
  values (inv.workspace_id, uid, inv.role)
  on conflict (workspace_id, user_id) do nothing;

  update invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  insert into audit_log (workspace_id, actor_id, action, entity, entity_id, data)
  values (inv.workspace_id, uid, 'invitation.accepted', 'invitation', inv.id, jsonb_build_object('role', inv.role));
  return inv.workspace_id;
end $$;

-- Security-definer functions are executable by PUBLIC by default; revoking from anon alone is a no-op.
revoke execute on function create_workspace(text, char, text) from public;
revoke execute on function accept_invitation(text) from public;
grant execute on function create_workspace(text, char, text) to authenticated;
grant execute on function accept_invitation(text) to authenticated;
revoke execute on function handle_new_user() from public;
