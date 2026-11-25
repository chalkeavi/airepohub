-- Milestone 2 follow-up to the initial schema, driven by Supabase's security and performance advisors
-- (2026-11-25) and by the product-page fields the UI needs.
--  1. Move security-definer helpers out of the API-exposed `public` schema into `private`.
--  2. Replace overlapping "for all" admin policies with insert/update/delete policies, so each
--     table has one SELECT policy, and call helpers via (select …) so Postgres evaluates them once.
--  3. Index every foreign key.
--  4. Add the product-page fields the UI renders (hero commands, best-for, quick facts, install notes).

-- ─────────────────────────────────────────────────────────────── 1. private helpers
create schema if not exists private;
grant usage on schema private to anon, authenticated;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

create or replace function private.repo_is_published(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.repositories where id = rid and status = 'published');
$$;

revoke all on function private.is_admin() from public;
revoke all on function private.repo_is_published(uuid) from public;
grant execute on function private.is_admin() to anon, authenticated;
grant execute on function private.repo_is_published(uuid) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────── 2. policies
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

drop function public.is_admin();
drop function public.repo_is_published(uuid);

-- One SELECT policy per table: published content for everyone, everything for admins.
create policy "read categories" on categories for select using (true);
create policy "read repositories" on repositories for select
  using (status = 'published' or (select private.is_admin()));
create policy "read aliases" on repository_aliases for select
  using (private.repo_is_published(repository_id) or (select private.is_admin()));
create policy "read repo categories" on repository_categories for select
  using (private.repo_is_published(repository_id) or (select private.is_admin()));
create policy "read content" on repository_content for select
  using (private.repo_is_published(repository_id) or (select private.is_admin()));
create policy "read guides" on installation_guides for select
  using ((status = 'published' and private.repo_is_published(repository_id)) or (select private.is_admin()));
create policy "read tutorials" on tutorials for select
  using ((status = 'published' and private.repo_is_published(repository_id)) or (select private.is_admin()));
create policy "read seo" on seo_metadata for select
  using (private.repo_is_published(repository_id) or (select private.is_admin()));
create policy "read collections" on collections for select
  using (status = 'published' or (select private.is_admin()));
create policy "read collection items" on collection_items for select
  using (
    (exists (select 1 from collections c where c.id = collection_id and c.status = 'published')
      and private.repo_is_published(repository_id))
    or (select private.is_admin()));
create policy "read stats" on repository_stats for select
  using (private.repo_is_published(repository_id) or (select private.is_admin()));
create policy "read rankings" on ranking_snapshots for select
  using (private.repo_is_published(repository_id) or (select private.is_admin()));

-- Admin-only tables
create policy "admins read admin_users" on admin_users for select using ((select private.is_admin()));
create policy "admins read runs" on automation_runs for select using ((select private.is_admin()));
create policy "admins read audit" on audit_logs for select using ((select private.is_admin()));
create policy "admins read queue" on discovery_queue for select using ((select private.is_admin()));
create policy "admins read drafts" on content_drafts for select using ((select private.is_admin()));

-- Admin writes (insert / update / delete) on editable tables
do $$
declare t text;
begin
  foreach t in array array[
    'categories', 'repositories', 'repository_aliases', 'repository_categories', 'repository_content',
    'installation_guides', 'tutorials', 'seo_metadata', 'collections', 'collection_items',
    'discovery_queue', 'content_drafts'
  ] loop
    execute format('create policy "admins insert" on public.%I for insert with check ((select private.is_admin()))', t);
    execute format('create policy "admins update" on public.%I for update using ((select private.is_admin())) with check ((select private.is_admin()))', t);
    execute format('create policy "admins delete" on public.%I for delete using ((select private.is_admin()))', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────── 3. foreign-key indexes
create index if not exists audit_logs_actor_idx on audit_logs (actor_id);
create index if not exists collection_items_repo_idx on collection_items (repository_id);
create index if not exists content_drafts_reviewed_by_idx on content_drafts (reviewed_by);
create index if not exists content_drafts_run_idx on content_drafts (run_id);
create index if not exists discovery_queue_repo_idx on discovery_queue (repository_id);
create index if not exists discovery_queue_reviewed_by_idx on discovery_queue (reviewed_by);
create index if not exists discovery_queue_run_idx on discovery_queue (run_id);
create index if not exists ranking_snapshots_category_idx on ranking_snapshots (category_id);
create index if not exists ranking_snapshots_repo_idx on ranking_snapshots (repository_id);
create index if not exists repository_content_reviewed_by_idx on repository_content (reviewed_by);

-- ─────────────────────────────────────────────────────────────── 4. product-page fields
alter table repository_content
  add column if not exists hero_commands jsonb not null default '[]',   -- [{comment?, command}]
  add column if not exists overview text[] not null default '{}',       -- paragraphs
  add column if not exists best_for text[] not null default '{}',
  add column if not exists facts jsonb not null default '[]',           -- [{label, value}]
  add column if not exists install_meta jsonb not null default '{}';    -- {verificationNote, supportedOs[], firstRun[], sourceUrl}

alter table repository_content alter column costs set default '[]';
alter table installation_guides add column if not exists label text;    -- tab label, e.g. "macOS"
alter table installation_guides add column if not exists sort_order int not null default 0;
