-- ClearDuty 0003: team list with emails (CD-004).
-- auth.users is not readable through RLS, so members are listed through this function,
-- which returns rows only for a workspace the caller belongs to.

create or replace function workspace_members(ws uuid)
returns table (user_id uuid, email text, full_name text, role member_role)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, p.full_name, m.role
  from memberships m
  join auth.users u on u.id = m.user_id
  left join profiles p on p.id = m.user_id
  where m.workspace_id = ws and is_member(ws)
  order by array_position(array['owner','admin','member','viewer']::member_role[], m.role), u.email;
$$;

revoke execute on function workspace_members(uuid) from public;
grant execute on function workspace_members(uuid) to authenticated;
