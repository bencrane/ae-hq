-- ae-hq cycle 3 schema — messaging, Bloomberg feed, recruiter pipeline
-- ADDITIVE migration. Does NOT drop or alter anything from 0001_init.sql.
-- All tables: RLS enabled, deny-all (no policies — cycle-1 convention). The BFF
-- uses the service role, which bypasses RLS; defense-in-depth WHERE clauses in
-- BFF code scope every query to the caller.

begin;

-- ---------- conversations ----------
-- One thread per AE<->company pair. UNIQUE(candidate_id, company_id) doubles as
-- the idempotency key for POST /api/v1/conversations.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(user_id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'archived')),
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  unique (candidate_id, company_id)
);
create index conversations_candidate_idx on public.conversations (candidate_id, last_message_at desc);
create index conversations_company_idx on public.conversations (company_id, last_message_at desc);

-- ---------- messages ----------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
-- thread pagination — ascending range scan within one conversation
create index messages_conversation_created_idx on public.messages (conversation_id, created_at);

-- ---------- articles ----------
-- Carrying Quota editorial. Content authored elsewhere; surfaced read-only here.
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('company_spotlight', 'compensation_data', 'leadership_moves')),
  slug text not null unique,
  title text not null,
  dek text,
  hero_image_url text,
  body_md text,
  author_name text,
  read_minutes integer,
  tags text[] not null default array[]::text[],
  published_at timestamptz not null default now()
);
create index articles_kind_published_idx on public.articles (kind, published_at desc);

-- ---------- pipeline_stages ----------
create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  position integer not null,
  color text not null default 'default',
  is_terminal boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, position)
);
create index pipeline_stages_company_idx on public.pipeline_stages (company_id, position);

-- ---------- pipeline_candidates ----------
create table public.pipeline_candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  candidate_id uuid not null references public.candidates(user_id) on delete cascade,
  stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  conversation_id uuid references public.conversations(id) on delete set null,
  notes text,
  added_by uuid not null references auth.users(id) on delete cascade,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (company_id, candidate_id)
);
create index pipeline_candidates_company_stage_idx on public.pipeline_candidates (company_id, stage_id);

-- ---------- pipeline_activity ----------
create table public.pipeline_activity (
  id uuid primary key default gen_random_uuid(),
  pipeline_candidate_id uuid not null references public.pipeline_candidates(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('added_to_pipeline', 'stage_changed', 'note_added', 'message_sent', 'unlocked')),
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index pipeline_activity_candidate_created_idx on public.pipeline_activity (pipeline_candidate_id, created_at);

-- ---------- RLS deny-all ----------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.articles enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.pipeline_candidates enable row level security;
alter table public.pipeline_activity enable row level security;

-- Deny all: no policies created, RLS denies all access from anon/authenticated.
-- The BFF uses the service role, which bypasses RLS. Defense-in-depth is
-- enforced in BFF code via WHERE clauses derived from the caller's JWT.

commit;
