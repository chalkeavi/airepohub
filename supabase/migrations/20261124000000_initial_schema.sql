-- AIRepoHub initial schema
-- Designed in Milestone 1, applied to Supabase in Milestone 2.
-- Conventions: uuid PKs, timestamptz, snake_case, enums for closed sets, RLS on every table.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;

-- ─────────────────────────────────────────────────────────────── enums
create type repo_status as enum ('draft', 'in_review', 'published', 'rejected', 'archived');
create type difficulty_level as enum ('beginner', 'intermediate', 'advanced');
create type repo_kind as enum ('app', 'cli', 'library', 'framework', 'platform', 'model', 'extension');
create type os_target as enum ('all', 'windows', 'macos', 'linux');
create type verification_status as enum ('verified', 'official_docs', 'awaiting_verification');
create type content_status as enum ('draft', 'published', 'archived');
create type queue_status as enum ('pending', 'drafting', 'ready_for_review', 'approved', 'rejected', 'ignored');
create type review_status as enum ('pending', 'approved', 'rejected', 'superseded');
create type draft_content_type as enum (
  'summary', 'overview', 'sixty_seconds', 'features', 'use_cases', 'requirements',
  'installation', 'tutorial', 'costs', 'troubleshooting', 'faq', 'seo', 'categories'
);
create type ranking_period as enum ('weekly', 'monthly', 'all_time');
create type admin_role as enum ('owner', 'editor');
create type run_status as enum ('running', 'succeeded', 'failed', 'partial');

-- ─────────────────────────────────────────────────────────────── helpers
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- array_to_string() is only STABLE, so generated columns need an IMMUTABLE wrapper
create or replace function text_array_to_string(arr text[]) returns text
language sql immutable parallel safe as $$ select array_to_string(arr, ' ') $$;

-- ─────────────────────────────────────────────────────────────── admin
create table admin_users (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        admin_role not null default 'editor',
  created_at  timestamptz not null default now()
);

-- security definer so RLS policies can call it without recursive RLS on admin_users
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;

-- ─────────────────────────────────────────────────────────────── categories
create table categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null unique,
  description  text,
  icon         text,                      -- lucide icon name
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger categories_updated_at before update on categories
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────── repositories
create table repositories (
  id                    uuid primary key default gen_random_uuid(),
  github_id             bigint not null unique,
  owner                 text not null,
  name                  text not null,
  full_name             citext not null unique,          -- owner/name, case-insensitive
  slug                  text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  github_url            text not null unique,
  homepage_url          text,
  description           text,                             -- GitHub's own description
  summary               text,                             -- our short plain-English line
  detailed_description  text,                             -- approved long-form overview (markdown)
  kind                  repo_kind,
  primary_language      text,
  license_key           text,                             -- SPDX id or 'NOASSERTION'
  topics                text[] not null default '{}',
  stars                 int not null default 0 check (stars >= 0),
  forks                 int not null default 0 check (forks >= 0),
  open_issues           int not null default 0 check (open_issues >= 0),
  avatar_url            text,
  is_archived           boolean not null default false,
  default_branch        text,
  created_at_github     timestamptz,
  updated_at_github     timestamptz,
  last_pushed_at        timestamptz,
  stats_checked_at      timestamptz,
  discovered_at         timestamptz not null default now(),
  published_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  status                repo_status not null default 'draft',
  difficulty            difficulty_level,
  featured              boolean not null default false,
  docs_quality          numeric(3,2) check (docs_quality between 0 and 1),  -- editorial ranking signal
  search_vector         tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(text_array_to_string(topics), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(detailed_description, '')), 'D')
  ) stored,
  constraint published_has_date check (status <> 'published' or published_at is not null)
);
create trigger repositories_updated_at before update on repositories
  for each row execute function set_updated_at();
create index repositories_status_published_idx on repositories (status, published_at desc);
create index repositories_stars_idx on repositories (stars desc) where status = 'published';
create index repositories_language_idx on repositories (primary_language) where status = 'published';
create index repositories_difficulty_idx on repositories (difficulty) where status = 'published';
create index repositories_featured_idx on repositories (featured) where featured;
create index repositories_pushed_idx on repositories (last_pushed_at desc);
create index repositories_search_idx on repositories using gin (search_vector);

-- old names / renamed repos / transferred owners → redirect to canonical slug
create table repository_aliases (
  id             uuid primary key default gen_random_uuid(),
  repository_id  uuid not null references repositories (id) on delete cascade,
  alias_slug     text unique,
  alias_full_name citext unique,
  created_at     timestamptz not null default now(),
  check (alias_slug is not null or alias_full_name is not null)
);
create index repository_aliases_repo_idx on repository_aliases (repository_id);

create table repository_categories (
  repository_id  uuid not null references repositories (id) on delete cascade,
  category_id    uuid not null references categories (id) on delete cascade,
  is_primary     boolean not null default false,
  primary key (repository_id, category_id)
);
create index repository_categories_category_idx on repository_categories (category_id);
create unique index repository_categories_one_primary
  on repository_categories (repository_id) where is_primary;

-- ─────────────────────────────────────────────────────────────── published content
create table repository_content (             -- structured sections of the product page
  repository_id    uuid primary key references repositories (id) on delete cascade,
  sixty_seconds    jsonb not null default '{}',  -- {whatItDoes, problem, whoFor[], whyChoose, requirements[]}
  features         jsonb not null default '[]',  -- [{title, body}]
  strengths        text[] not null default '{}',
  limitations      text[] not null default '{}',
  use_cases        jsonb not null default '[]',
  costs            jsonb not null default '{}',
  troubleshooting  jsonb not null default '[]',  -- [{problem, solution, sourceUrl}]
  faqs             jsonb not null default '[]',
  source_urls      text[] not null default '{}',
  source_commit_sha text,
  last_reviewed_at timestamptz,
  reviewed_by      uuid references auth.users (id),
  updated_at       timestamptz not null default now()
);
create trigger repository_content_updated_at before update on repository_content
  for each row execute function set_updated_at();

create table installation_guides (
  id                   uuid primary key default gen_random_uuid(),
  repository_id        uuid not null references repositories (id) on delete cascade,
  operating_system     os_target not null default 'all',
  method               text not null default 'default',   -- e.g. 'source', 'docker', 'pip'
  prerequisites        jsonb not null default '[]',
  instructions         jsonb not null default '[]',       -- [{title, body, code, lang}]
  environment          jsonb not null default '[]',       -- [{name, required, description}]
  expected_output      text,
  verification_status  verification_status not null default 'awaiting_verification',
  source_url           text not null,
  source_commit_sha    text,
  last_reviewed_at     timestamptz,
  status               content_status not null default 'draft',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (repository_id, operating_system, method)
);
create trigger installation_guides_updated_at before update on installation_guides
  for each row execute function set_updated_at();

create table tutorials (
  id             uuid primary key default gen_random_uuid(),
  repository_id  uuid not null references repositories (id) on delete cascade,
  title          text not null,
  slug           text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  content        jsonb not null,                -- {useCase, setup[], steps[], expected, nextSteps[]}
  difficulty     difficulty_level,
  status         content_status not null default 'draft',
  source_url     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (repository_id, slug)
);
create trigger tutorials_updated_at before update on tutorials
  for each row execute function set_updated_at();

create table seo_metadata (
  repository_id   uuid primary key references repositories (id) on delete cascade,
  title           text check (char_length(title) <= 70),
  description     text check (char_length(description) <= 170),
  og_image_url    text,
  noindex         boolean not null default false,
  updated_at      timestamptz not null default now()
);

create table collections (                      -- curated lists for social campaigns
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text not null,
  description  text,
  status       content_status not null default 'draft',
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create table collection_items (
  collection_id  uuid not null references collections (id) on delete cascade,
  repository_id  uuid not null references repositories (id) on delete cascade,
  position       int not null,
  note           text,
  primary key (collection_id, repository_id),
  unique (collection_id, position)
);

-- ─────────────────────────────────────────────────────────────── stats & rankings
create table repository_stats (
  id             bigint generated always as identity primary key,
  repository_id  uuid not null references repositories (id) on delete cascade,
  recorded_at    timestamptz not null default now(),
  recorded_on    date not null default (now() at time zone 'utc')::date,
  stars          int not null,
  forks          int not null,
  open_issues    int not null,
  unique (repository_id, recorded_on)            -- one snapshot per repo per day → idempotent job
);
create index repository_stats_repo_time_idx on repository_stats (repository_id, recorded_at desc);

create table ranking_snapshots (
  id              bigint generated always as identity primary key,
  repository_id   uuid not null references repositories (id) on delete cascade,
  period          ranking_period not null,
  category_id     uuid references categories (id) on delete cascade,  -- null = global
  calculated_at   timestamptz not null,
  ranking_score   numeric(8,5) not null,
  rank            int not null check (rank > 0),
  previous_rank   int,
  star_growth     int,                          -- stars gained in window, null when unknown
  signals         jsonb not null default '{}',  -- per-signal normalized values used
  methodology_version text not null default 'v1'
);
create unique index ranking_snapshots_unique
  on ranking_snapshots (period, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid), calculated_at, repository_id);
create index ranking_snapshots_lookup_idx
  on ranking_snapshots (period, category_id, calculated_at desc, rank);

-- ─────────────────────────────────────────────────────────────── automation & review
create table automation_runs (
  id             uuid primary key default gen_random_uuid(),
  job            text not null,                 -- discover | snapshot | rank | draft | refresh
  status         run_status not null default 'running',
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  items_processed int not null default 0,
  items_failed   int not null default 0,
  api_calls      int not null default 0,
  ai_tokens      int not null default 0,
  error          text,
  details        jsonb not null default '{}'
);
create index automation_runs_job_idx on automation_runs (job, started_at desc);

create table discovery_queue (
  id               uuid primary key default gen_random_uuid(),
  github_id        bigint not null unique,       -- dedupe key
  full_name        citext not null,
  github_url       text not null,
  payload          jsonb not null default '{}',  -- normalized GitHub metadata at discovery
  discovered_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  relevance_score  numeric(5,4) check (relevance_score between 0 and 1),
  relevance_reasons text[] not null default '{}',
  status           queue_status not null default 'pending',
  review_notes     text,
  reviewed_by      uuid references auth.users (id),
  reviewed_at      timestamptz,
  repository_id    uuid references repositories (id) on delete set null,
  run_id           uuid references automation_runs (id) on delete set null
);
create index discovery_queue_status_idx on discovery_queue (status, relevance_score desc);

create table content_drafts (
  id                uuid primary key default gen_random_uuid(),
  repository_id     uuid not null references repositories (id) on delete cascade,
  content_type      draft_content_type not null,
  generated_content jsonb not null,
  uncertain_fields  text[] not null default '{}',  -- flagged by the model for human review
  source_refs       jsonb not null default '[]',   -- [{url, commitSha, section}]
  model_used        text not null,
  source_revision   text,                          -- commit SHA the draft was based on
  review_status     review_status not null default 'pending',
  reviewer_notes    text,
  reviewed_by       uuid references auth.users (id),
  reviewed_at       timestamptz,
  run_id            uuid references automation_runs (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index content_drafts_review_idx on content_drafts (review_status, created_at desc);
create index content_drafts_repo_idx on content_drafts (repository_id, content_type);

create table audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid references auth.users (id),   -- null = automation
  action       text not null,                     -- e.g. repository.publish
  entity_type  text not null,
  entity_id    text not null,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id, created_at desc);

-- ─────────────────────────────────────────────────────────────── RLS
alter table admin_users          enable row level security;
alter table categories           enable row level security;
alter table repositories         enable row level security;
alter table repository_aliases   enable row level security;
alter table repository_categories enable row level security;
alter table repository_content   enable row level security;
alter table installation_guides  enable row level security;
alter table tutorials            enable row level security;
alter table seo_metadata         enable row level security;
alter table collections          enable row level security;
alter table collection_items     enable row level security;
alter table repository_stats     enable row level security;
alter table ranking_snapshots    enable row level security;
alter table automation_runs      enable row level security;
alter table discovery_queue      enable row level security;
alter table content_drafts       enable row level security;
alter table audit_logs           enable row level security;

-- helper: is this repository public?
create or replace function repo_is_published(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from repositories where id = rid and status = 'published');
$$;

-- Public read policies (anon + authenticated)
create policy "public read categories" on categories for select using (true);
create policy "public read published repos" on repositories for select
  using (status = 'published' or is_admin());
create policy "public read aliases" on repository_aliases for select
  using (repo_is_published(repository_id) or is_admin());
create policy "public read repo categories" on repository_categories for select
  using (repo_is_published(repository_id) or is_admin());
create policy "public read content" on repository_content for select
  using (repo_is_published(repository_id) or is_admin());
create policy "public read guides" on installation_guides for select
  using ((status = 'published' and repo_is_published(repository_id)) or is_admin());
create policy "public read tutorials" on tutorials for select
  using ((status = 'published' and repo_is_published(repository_id)) or is_admin());
create policy "public read seo" on seo_metadata for select
  using (repo_is_published(repository_id) or is_admin());
create policy "public read collections" on collections for select
  using (status = 'published' or is_admin());
create policy "public read collection items" on collection_items for select
  using (
    (exists (select 1 from collections c where c.id = collection_id and c.status = 'published')
      and repo_is_published(repository_id))
    or is_admin());
create policy "public read stats" on repository_stats for select
  using (repo_is_published(repository_id) or is_admin());
create policy "public read rankings" on ranking_snapshots for select
  using (repo_is_published(repository_id) or is_admin());

-- Admin-only tables (no anon access at all)
create policy "admins read admin_users" on admin_users for select using (is_admin());
create policy "admins read runs" on automation_runs for select using (is_admin());
create policy "admins manage queue" on discovery_queue for all using (is_admin()) with check (is_admin());
create policy "admins manage drafts" on content_drafts for all using (is_admin()) with check (is_admin());
create policy "admins read audit" on audit_logs for select using (is_admin());

-- Admin write policies on content tables
create policy "admins write categories" on categories for all using (is_admin()) with check (is_admin());
create policy "admins write repos" on repositories for all using (is_admin()) with check (is_admin());
create policy "admins write aliases" on repository_aliases for all using (is_admin()) with check (is_admin());
create policy "admins write repo categories" on repository_categories for all using (is_admin()) with check (is_admin());
create policy "admins write content" on repository_content for all using (is_admin()) with check (is_admin());
create policy "admins write guides" on installation_guides for all using (is_admin()) with check (is_admin());
create policy "admins write tutorials" on tutorials for all using (is_admin()) with check (is_admin());
create policy "admins write seo" on seo_metadata for all using (is_admin()) with check (is_admin());
create policy "admins write collections" on collections for all using (is_admin()) with check (is_admin());
create policy "admins write collection items" on collection_items for all using (is_admin()) with check (is_admin());

-- Automation (GitHub Actions) uses the service_role key, which bypasses RLS.
-- admin_users rows are managed only via the Supabase dashboard / service role (no write policy).
-- audit_logs are append-only from server code using the service role (no update/delete policy).
