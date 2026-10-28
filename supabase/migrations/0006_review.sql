-- CD-040 to CD-042: review queue, confirm and override, classification card.
--
-- Clients cannot write classifications or agent questions (0002). People change them only
-- through these functions, which check the role, check that the caller saw the current state,
-- and write an audit row in the same transaction.
--
-- Errors: 42501 not allowed; 22023 invalid input; P0001 with a message code for states:
--   stale            the code or the product changed since the caller loaded it
--   not_confirmable  the current code cannot be confirmed in its status (or has no code)
--   unknown_code     not a 10-digit line of the tariff in force today
--   broker_verified  only owners and admins replace a broker-verified code
--   already_answered the question has an answer

-- ============ 1. The tariff revision in force ============
-- current_revision() (0001) also returns revisions that take effect in the future; people
-- confirm codes against the one in force today.
create or replace function revision_in_force(p_market public.market_code)
returns uuid
language sql stable security invoker set search_path = '' as $$
  select r.id from public.tariff_revisions r
  where r.market = p_market and r.effective_from <= current_date
  order by r.effective_from desc, r.imported_at desc
  limit 1;
$$;

-- A 10-digit line someone can file under (a leaf) in the given revision.
create or replace function is_filing_code(p_revision uuid, p_code text)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select p_code ~ '^[0-9]{10}$' and exists (
    select 1 from public.tariff_lines t
    where t.revision_id = p_revision and t.code = p_code and t.is_leaf
  );
$$;

-- The path from the heading down to a line. Lines are stored in schedule order (tariff_lines.id,
-- so the importer must insert each revision as one ordered stream), and a line's parent is the
-- closest line above it with a smaller indent (indents can skip levels).
create index if not exists tariff_lines_order on tariff_lines (revision_id, id);

create or replace function hts_breadcrumb(p_revision uuid, p_code text)
returns table (code text, indent integer, description text)
language sql stable security invoker set search_path = '' as $$
  with recursive chain as (
    (select t.id, t.indent, t.code, t.description, 0 as depth
     from public.tariff_lines t
     where t.revision_id = p_revision and t.code = p_code
     order by t.is_leaf desc, t.id
     limit 1)
    union all
    select a.id, a.indent, a.code, a.description, ch.depth + 1
    from chain ch
    cross join lateral (
      select t.id, t.indent, t.code, t.description from public.tariff_lines t
      where t.revision_id = p_revision and t.id < ch.id and t.indent < ch.indent
      order by t.id desc
      limit 1
    ) a
    where ch.indent > 0 and ch.depth < 20
  )
  select chain.code, chain.indent, chain.description from chain order by chain.depth desc;
$$;

-- ============ 2. The review queue (CD-040) ============
-- Current codes that need a person: questions first, then low confidence, then outdated, then
-- plain suggestions; oldest first within each.
create view review_queue with (security_invoker = true) as
select
  c.id,
  c.workspace_id,
  c.product_id,
  c.market,
  c.status,
  c.code,
  c.confidence,
  c.created_at,
  case c.status
    when 'needs_answer' then 1
    when 'in_review' then 2
    when 'outdated' then 3
    else 4
  end as priority
from public.classifications c
where c.is_current
  and c.status in ('needs_answer', 'in_review', 'outdated', 'suggested');

revoke all on review_queue from anon, authenticated;
grant select on review_queue to authenticated;

create index classifications_review on classifications (workspace_id, market, created_at, id)
  where is_current and status in ('needs_answer', 'in_review', 'outdated', 'suggested');

-- The item at p_at (or the first one when p_at is null or no longer queued), its neighbours,
-- its position and the queue length.
create or replace function review_position(
  p_workspace uuid, p_at uuid default null, p_market public.market_code default 'US'
)
returns table (id uuid, prev_id uuid, next_id uuid, "position" bigint, total bigint)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select
      r.id,
      lag(r.id) over w as prev_id,
      lead(r.id) over w as next_id,
      row_number() over w as "position",
      count(*) over () as total
    from public.review_queue r
    where r.workspace_id = p_workspace and r.market = p_market
    window w as (order by r.priority, r.created_at, r.id)
  )
  select q.id, q.prev_id, q.next_id, q."position", q.total from q
  order by (q.id = p_at) desc nulls last, q."position"
  limit 1;
$$;

-- ============ 3. Confirm and override (CD-041) ============
-- Each function authorises from an unlocked read first (so nobody can lock another tenant's
-- rows), then locks the product and then the classification or question: the same order as the
-- product triggers, so decisions on one product run one at a time and never deadlock.

-- Owners, admins and members of a live workspace.
create or replace function can_decide(p_workspace uuid)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select p_workspace is not null
    and public.has_role(p_workspace, array['owner', 'admin', 'member']::public.member_role[])
    and not exists (select 1 from public.workspaces w
                    where w.id = p_workspace and w.deleted_at is not null);
$$;

-- Confirm the current code as it is. p_code and p_content_hash are the code and the product's
-- content hash the caller saw, so nobody confirms a code, or product text, they have not seen.
create or replace function confirm_classification(
  p_classification uuid, p_code text, p_content_hash text
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_workspace uuid;
  v_product uuid;
  c public.classifications%rowtype;
  v_hash text;
  v_revision uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select x.workspace_id, x.product_id into v_workspace, v_product
  from public.classifications x where x.id = p_classification;
  if not public.can_decide(v_workspace) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select p.content_hash into v_hash from public.products p
  where p.id = v_product and p.workspace_id = v_workspace
  for update;
  select * into c from public.classifications where id = p_classification for update;
  if not c.is_current or c.code is distinct from p_code
     or v_hash is distinct from p_content_hash then
    raise exception 'stale';
  end if;
  if c.code is null or c.status not in ('suggested', 'in_review', 'outdated') then
    raise exception 'not_confirmable';
  end if;
  v_revision := public.revision_in_force(c.market);
  if v_revision is null or not public.is_filing_code(v_revision, c.code) then
    raise exception 'unknown_code';
  end if;

  update public.classifications
  set status = 'confirmed', confirmed_by = uid, confirmed_at = now(),
      tariff_revision_id = v_revision
  where id = c.id;

  insert into public.audit_log (workspace_id, actor_id, action, entity, entity_id, data)
  values (c.workspace_id, uid, 'classification.confirm', 'classification', c.id,
    jsonb_build_object('product_id', c.product_id, 'market', c.market, 'code', c.code,
      'previous_status', c.status, 'confidence', c.confidence,
      'agent_run_id', c.agent_run_id, 'tariff_revision_id', v_revision,
      'content_hash', v_hash));
  return c.id;
end $$;

-- Replace the current code (or set the first one) with the caller's own code and reason. The
-- old row stays as history. p_expected, p_expected_code and p_expected_status are the current
-- classification the caller saw (all null when the product had none). A broker-verified code is a paid record: only owners and admins
-- (who may order broker checks, docs/03-security.md) can replace it.
create or replace function override_classification(
  p_product uuid,
  p_expected uuid,
  p_expected_code text,
  p_expected_status public.class_status,
  p_code text,
  p_reason text,
  p_content_hash text,
  p_market public.market_code default 'US'
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_workspace uuid;
  v_hash text;
  cur public.classifications%rowtype;
  v_revision uuid;
  v_reason text := btrim(p_reason);
  v_id uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select p.workspace_id into v_workspace from public.products p where p.id = p_product;
  if not public.can_decide(v_workspace) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select p.content_hash into v_hash from public.products p
  where p.id = p_product and p.workspace_id = v_workspace
  for update;
  select * into cur from public.classifications c
  where c.product_id = p_product and c.workspace_id = v_workspace and c.market = p_market
    and c.is_current
  for update;
  if cur.id is distinct from p_expected or cur.code is distinct from p_expected_code
     or cur.status is distinct from p_expected_status or v_hash is distinct from p_content_hash then
    raise exception 'stale';
  end if;
  if cur.status = 'broker_verified'
     and not public.has_role(v_workspace, array['owner', 'admin']::public.member_role[]) then
    raise exception 'broker_verified';
  end if;
  if v_reason is null or char_length(v_reason) not between 3 and 500
     or not public.is_clean_text(v_reason) or not public.is_not_blank(v_reason) then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  v_revision := public.revision_in_force(p_market);
  if v_revision is null or not public.is_filing_code(v_revision, p_code) then
    raise exception 'unknown_code';
  end if;

  if cur.id is not null then
    update public.classifications set is_current = false where id = cur.id;
  end if;
  insert into public.classifications (workspace_id, product_id, market, code, tariff_revision_id,
    status, source, override_reason, confirmed_by, confirmed_at, is_current)
  values (v_workspace, p_product, p_market, p_code, v_revision,
    'confirmed', 'override', v_reason, uid, now(), true)
  returning id into v_id;

  insert into public.audit_log (workspace_id, actor_id, action, entity, entity_id, data)
  values (v_workspace, uid, 'classification.override', 'classification', v_id,
    jsonb_build_object('product_id', p_product, 'market', p_market, 'code', p_code,
      'previous_code', cur.code, 'previous_status', cur.status, 'previous_id', cur.id,
      'reason', v_reason, 'tariff_revision_id', v_revision, 'content_hash', v_hash));
  return v_id;
end $$;

-- ============ 4. Answering the agent's questions (Q in the queue) ============
-- Only questions from the run behind the product's current `needs_answer` code can be answered
-- (older ones are stale). When that run has no open questions left, the code goes back to
-- 'queued' for the agent (CD-034 starts the re-run).
create or replace function answer_agent_question(p_question uuid, p_answer text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_workspace uuid;
  v_product uuid;
  q public.agent_questions%rowtype;
  cur public.classifications%rowtype;
  v_answer text := btrim(p_answer);
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select x.workspace_id, x.product_id into v_workspace, v_product
  from public.agent_questions x where x.id = p_question;
  if not public.can_decide(v_workspace) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_answer is null or char_length(v_answer) not between 1 and 300
     or not public.is_clean_text(v_answer) or not public.is_not_blank(v_answer) then
    raise exception 'invalid_answer' using errcode = '22023';
  end if;

  -- The product lock serialises answers to the same product, so the last answer always sees
  -- the others and re-queues the code.
  perform 1 from public.products p
  where p.id = v_product and p.workspace_id = v_workspace
  for update;
  select * into q from public.agent_questions where id = p_question for update;
  if q.answered_at is not null then raise exception 'already_answered'; end if;
  select * into cur from public.classifications c
  where c.product_id = v_product and c.workspace_id = v_workspace and c.is_current
    and c.status = 'needs_answer' and c.agent_run_id is not distinct from q.agent_run_id
  for update;
  if not found then raise exception 'stale'; end if;

  update public.agent_questions
  set answer = v_answer, answered_by = uid, answered_at = now()
  where id = q.id;

  if not exists (select 1 from public.agent_questions o
                 where o.product_id = v_product and o.workspace_id = v_workspace
                   and o.agent_run_id is not distinct from q.agent_run_id
                   and o.answered_at is null) then
    update public.classifications set status = 'queued' where id = cur.id;
  end if;

  insert into public.audit_log (workspace_id, actor_id, action, entity, entity_id, data)
  values (v_workspace, uid, 'question.answer', 'agent_question', q.id,
    jsonb_build_object('product_id', v_product, 'agent_run_id', q.agent_run_id,
      'question', q.question, 'answer', v_answer));
end $$;

-- Signed-in users only; the functions check the role themselves.
revoke execute on function revision_in_force(public.market_code), is_filing_code(uuid, text),
  hts_breadcrumb(uuid, text), review_position(uuid, uuid, public.market_code),
  confirm_classification(uuid, text, text), can_decide(uuid),
  override_classification(uuid, uuid, text, public.class_status, text, text, text,
    public.market_code),
  answer_agent_question(uuid, text)
  from public, anon;
grant execute on function revision_in_force(public.market_code), is_filing_code(uuid, text),
  hts_breadcrumb(uuid, text), review_position(uuid, uuid, public.market_code),
  confirm_classification(uuid, text, text), can_decide(uuid),
  override_classification(uuid, uuid, text, public.class_status, text, text, text,
    public.market_code),
  answer_agent_question(uuid, text)
  to authenticated;
