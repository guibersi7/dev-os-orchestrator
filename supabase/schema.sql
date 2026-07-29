create extension if not exists "pgcrypto";

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  dashboard_preferences jsonb not null default '{}'::jsonb,
  notification_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.integration_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service text not null,
  status text not null default 'available',
  scopes text[] not null default '{}',
  settings jsonb not null default '{}'::jsonb,
  sync_cursor text,
  last_sync_error text,
  last_sync_records_scanned integer not null default 0,
  last_sync_events_created integer not null default 0,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_configs_service_check check (service in ('github', 'slack', 'linear', 'jira', 'trello', 'notion', 'calendar')),
  constraint integration_configs_status_check check (status in ('connected', 'available', 'error', 'needs_auth', 'syncing')),
  unique (workspace_id, service)
);

create table if not exists public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service text not null,
  provider_account_id text not null default 'default',
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  expires_at timestamptz,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_tokens_service_check check (service in ('github', 'slack', 'linear', 'jira', 'trello', 'notion', 'calendar')),
  unique (workspace_id, service, provider_account_id)
);

create table if not exists public.work_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service text not null,
  type text not null,
  title text not null,
  source text not null,
  actor text not null,
  priority text not null,
  summary text not null,
  occurred_at timestamptz not null,
  raw jsonb not null default '{}'::jsonb,
  external_id text not null,
  created_at timestamptz not null default now(),
  constraint work_events_service_check check (service in ('github', 'slack', 'linear', 'jira', 'trello', 'notion', 'calendar')),
  constraint work_events_priority_check check (priority in ('low', 'medium', 'high'))
);

create table if not exists public.dashboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  payload jsonb not null,
  generated_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service text not null,
  external_id text not null,
  title text not null,
  source text not null,
  url text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint document_chunks_service_check check (service in ('github', 'slack', 'linear', 'jira', 'trello', 'notion', 'calendar')),
  unique (workspace_id, service, external_id)
);

create index if not exists work_events_workspace_occurred_idx
  on public.work_events (workspace_id, occurred_at desc);

create index if not exists work_events_workspace_service_idx
  on public.work_events (workspace_id, service, occurred_at desc);

create unique index if not exists work_events_workspace_external_id_idx
  on public.work_events (workspace_id, service, external_id);

create index if not exists integration_tokens_workspace_service_idx
  on public.integration_tokens (workspace_id, service);

create index if not exists dashboard_snapshots_workspace_generated_idx
  on public.dashboard_snapshots (workspace_id, generated_at desc);

create index if not exists document_chunks_workspace_service_idx
  on public.document_chunks (workspace_id, service, updated_at desc);
