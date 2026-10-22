-- ClearDuty 0004: HTS import bookkeeping (CD-010)

-- A revision is "importing" until every chapter is in; only complete revisions are current,
-- so a half-finished import is never used for classification or costs.
alter table tariff_revisions
  add column status text not null default 'importing' check (status in ('importing','complete','failed')),
  add column line_count int,
  add column completed_at timestamptz;

create or replace function current_revision(m market_code) returns uuid
language sql stable as $$
  select id from tariff_revisions
  where market = m and status = 'complete'
  order by effective_from desc, imported_at desc limit 1;
$$;

-- Codeless grouping rows ("Other:") repeat at the same indent within a chapter, so
-- (code, indent, description) is not unique. Lines are keyed by their position in the schedule.
alter table tariff_lines drop constraint tariff_lines_revision_id_code_indent_description_key;
alter table tariff_lines add column position int not null;
alter table tariff_lines add constraint tariff_lines_revision_position_key unique (revision_id, position);
create index tariff_lines_revision_code on tariff_lines (revision_id, code) where code <> '';
