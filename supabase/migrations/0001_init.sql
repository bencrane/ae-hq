-- ae-hq cycle 1 schema
-- RLS deny-all by default; BFF accesses via service-role with defense-in-depth WHERE user_id = $auth_uid

begin;

-- clean any prior cycle's partial schema
drop table if exists public.notifications cascade;
drop table if exists public.ats_connections cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.unlock_requests cascade;
drop table if exists public.verified_credentials cascade;
drop table if exists public.credential_uploads cascade;
drop table if exists public.intent_signals cascade;
drop table if exists public.jobs cascade;
drop table if exists public.ae_work_history cascade;
drop table if exists public.company_members cascade;
drop table if exists public.candidates cascade;
drop table if exists public.companies cascade;
drop table if exists public.profiles cascade;
drop table if exists public.oauth_connections cascade;

create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kind text not null check (kind in ('candidate','company_member','admin')),
  email text not null,
  name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (email);

-- ---------- companies ----------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  domain text,
  logo_url text,
  hq_location text,
  size_range text check (size_range in ('1-10','11-50','51-200','201-500','501-1000','1001+')),
  stage text check (stage in ('Seed','SeriesA','SeriesB','SeriesC','SeriesD','Public','Bootstrapped')),
  description text,
  is_claimed boolean not null default false,
  is_subscribed boolean not null default false,
  created_at timestamptz not null default now()
);
create index companies_slug_idx on public.companies (slug);

-- ---------- candidates ----------
create table public.candidates (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  headline text,
  linkedin_url text,
  segment_focus text check (segment_focus in ('SMB','MidMarket','Enterprise','StrategicEnterprise')),
  methodology text[] not null default array[]::text[],
  current_company_id uuid references public.companies(id) on delete set null,
  created_at timestamptz not null default now()
);
create index candidates_current_company_idx on public.candidates (current_company_id);

-- ---------- company_members ----------
create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in ('admin','recruiter','member')),
  created_at timestamptz not null default now(),
  unique (user_id, company_id)
);
create index company_members_user_idx on public.company_members (user_id);
create index company_members_company_idx on public.company_members (company_id);

-- ---------- ae_work_history ----------
create table public.ae_work_history (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(user_id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  title text not null,
  segment text check (segment in ('SMB','MidMarket','Enterprise','StrategicEnterprise')),
  start_date date not null,
  end_date date,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);
-- p5 predicted fix: covering index for /co/candidates "worked at X" filter
create index ae_work_history_company_candidate_idx on public.ae_work_history (company_id, candidate_id);
create index ae_work_history_candidate_idx on public.ae_work_history (candidate_id);

-- ---------- jobs ----------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  segment text not null check (segment in ('SMB','MidMarket','Enterprise','StrategicEnterprise')),
  ote_min integer not null,
  ote_max integer not null,
  base_min integer not null,
  base_max integer not null,
  deal_size_avg integer not null,
  sales_cycle_days integer not null,
  methodology text check (methodology in ('MEDDIC','MEDDPICC','ChallengerSale','SPIN','Sandler','BANT','CommandOfMessage')),
  stack text[] not null default array[]::text[],
  stage text not null check (stage in ('Seed','SeriesA','SeriesB','SeriesC','SeriesD','Public','Bootstrapped')),
  location text not null,
  is_remote boolean not null default false,
  posted_at timestamptz not null default now()
);
create index jobs_company_idx on public.jobs (company_id);
create index jobs_segment_stage_idx on public.jobs (segment, stage);

-- ---------- intent_signals ----------
create table public.intent_signals (
  candidate_id uuid primary key references public.candidates(user_id) on delete cascade,
  target_stages text[] not null default array[]::text[],
  target_segments text[] not null default array[]::text[],
  comp_ote_min integer,
  target_geos text[] not null default array[]::text[],
  target_companies uuid[] not null default array[]::uuid[],
  updated_at timestamptz not null default now()
);

-- ---------- verified_credentials ----------
create table public.verified_credentials (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(user_id) on delete cascade,
  kind text not null check (kind in ('quota_attainment','deal_value','logos_closed','tenure','income_w2','income_1099')),
  period_start date not null,
  period_end date not null,
  value_json jsonb not null,
  source text not null,
  verification_tier text not null check (verification_tier in ('self_reported','csv_upload','plaid_payroll','ats_attestation')),
  captured_at timestamptz not null default now()
);
create index verified_credentials_candidate_idx on public.verified_credentials (candidate_id);

-- ---------- credential_uploads (intermediate state for CSV upload flow) ----------
create table public.credential_uploads (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(user_id) on delete cascade,
  filename text not null,
  content_type text not null,
  byte_size integer not null,
  storage_path text not null,
  parsed_at timestamptz,
  created_at timestamptz not null default now()
);
create index credential_uploads_candidate_idx on public.credential_uploads (candidate_id);

-- ---------- unlock_requests ----------
create table public.unlock_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  candidate_id uuid not null references public.candidates(user_id) on delete cascade,
  status text not null check (status in ('pending','accepted','declined','expired')),
  message text,
  mock_stripe_charge_id text,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index unlock_requests_candidate_idx on public.unlock_requests (candidate_id, status);
create index unlock_requests_company_idx on public.unlock_requests (company_id, status);

-- ---------- subscriptions ----------
create table public.subscriptions (
  company_id uuid primary key references public.companies(id) on delete cascade,
  stripe_subscription_id text,
  tier text not null check (tier in ('starter','growth','scale')),
  unlocks_per_month integer not null,
  unlocks_used_current_period integer not null default 0,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '30 days')
);

-- ---------- ats_connections ----------
create table public.ats_connections (
  company_id uuid not null references public.companies(id) on delete cascade,
  vendor text not null check (vendor in ('greenhouse','lever','ashby','rippling','bamboohr')),
  encrypted_credentials text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (company_id, vendor)
);

-- ---------- notifications ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  kind text not null check (kind in ('unlock_requested','unlock_accepted','unlock_declined','credential_verified','subscription_updated')),
  payload_json jsonb not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications (user_id, read_at);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- ---------- RLS deny-all ----------
alter table public.profiles enable row level security;
alter table public.candidates enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.ae_work_history enable row level security;
alter table public.jobs enable row level security;
alter table public.intent_signals enable row level security;
alter table public.verified_credentials enable row level security;
alter table public.credential_uploads enable row level security;
alter table public.unlock_requests enable row level security;
alter table public.subscriptions enable row level security;
alter table public.ats_connections enable row level security;
alter table public.notifications enable row level security;

-- Deny all: no policies created, RLS denies all access from anon/authenticated.
-- The BFF uses the service role, which bypasses RLS. Defense-in-depth is enforced
-- in BFF code via WHERE user_id = <derived from JWT> clauses in every query.

commit;
