-- ae-hq cycle 6 schema — intent, consent & matchmaking.
--
-- ADDITIVE migration. Does NOT drop or alter anything destructive from
-- 0001-0004. Every object uses `add column if not exists` / `create table if
-- not exists`, and the one constraint relaxation (notifications.kind) is
-- guarded so a re-run is safe. `0001`-`0004` are NEVER re-run.
--
-- Data model (cycle 6):
--   `intent_signals` (cycle 1) gains four columns: an AE's investor criteria,
--   watched companies, the auto_match standing-consent toggle, and a
--   discoverable exposure toggle.
--   `company_match_criteria` (NEW) is a company's standing consent — the
--   criteria a candidate must satisfy for the company's consent to be standing.
--   `matches` (NEW) is the consent spine: one row per (company, candidate,
--   job?) connecting two parties; it resolves to a `conversations` thread the
--   instant both sides have consented.
--
-- `unlock_requests` vs `matches` (executor decision — RUN PARALLEL):
--   `unlock_requests` (cycle 1) is KEPT untouched — it stays the company-side
--   payment artifact (the mock-Stripe charge + budget mechanic). `matches` is
--   the NEW consent spine. The unlock flow creates a `matches` row
--   (origin=company_initiated) ALONGSIDE the unlock_request row, so the
--   company-initiated-via-unlock path produces a match. `/me/approvals` is
--   reworked to be match-aware: it surfaces pending_ae `matches`. The two
--   tables coexist; no row migration. (Same migrate-vs-parallel pattern as
--   cycle-5's pipeline_candidates-vs-applications decision.)

begin;

-- ---------- intent_signals: 4 new columns (cycle-6) ----------
-- target_investors: VC firms the AE wants to hear from (real firm names).
-- watched_companies: specific company ids the AE wants alerted on when hiring.
-- auto_match: the AE's STANDING-consent setting — when true, a company that
--   satisfies the AE's own declared criteria resolves a match with no prompt.
-- discoverable: when true, companies that fit the AE's criteria can discover
--   the AE in matchmaking results. The default is true (an existing AE stays
--   discoverable); auto_match defaults false (standing consent is opt-in).
-- Array columns DEFAULT '{}' so existing rows come back as empty arrays, never
-- NULL — the seed and the BFF can treat "no criteria" uniformly without a
-- null-guard. (validator prediction: array-column defaults.)
alter table public.intent_signals
  add column if not exists target_investors text[] not null default array[]::text[];
alter table public.intent_signals
  add column if not exists watched_companies uuid[] not null default array[]::uuid[];
alter table public.intent_signals
  add column if not exists auto_match boolean not null default false;
alter table public.intent_signals
  add column if not exists discoverable boolean not null default true;

-- ---------- company_match_criteria ----------
-- A company's standing consent. A candidate who satisfies these criteria AND
-- expresses interest connects with the company automatically (no per-candidate
-- approval). `company_id` is the PK — one criteria row per company.
-- All array columns DEFAULT '{}' — an empty array means "no constraint on this
-- dimension" (a company that set no segments is open to every segment).
create table if not exists public.company_match_criteria (
  company_id uuid primary key references public.companies(id) on delete cascade,
  segments text[] not null default array[]::text[],
  sales_motions text[] not null default array[]::text[],
  min_years_experience integer not null default 0,
  worked_at_company_ids uuid[] not null default array[]::uuid[],
  investor_pedigree text[] not null default array[]::text[],
  updated_at timestamptz not null default now()
);

-- ---------- matches ----------
-- The consent spine. One row connects one company and one AE, optionally tied
-- to a job posting. `job_id` is NULLABLE — a match may be a general talent
-- match with no posting. `conversation_id` is NULLABLE — a thread exists only
-- once the match resolves (no conversation before consent — anonymization).
-- `resolved_at` is NULLABLE — set only on resolution.
--
-- origin          — which side initiated (ae_initiated | company_initiated).
-- ae_consent      — standing | explicit | pending.
-- company_consent — standing | explicit | pending.
-- status          — resolved | pending_ae | pending_company | declined | expired.
--
-- UNIQUE(company_id, candidate_id, job_id) is the consent engine's idempotency
-- key — a duplicate interest action finds the existing row instead of inserting
-- a second. NOTE: in Postgres a NULL is distinct from every value, so two rows
-- with the SAME (company, candidate) and job_id NULL would NOT collide on a
-- plain UNIQUE. To make the general-talent match (job_id NULL) idempotent too,
-- a partial unique index over (company_id, candidate_id) WHERE job_id IS NULL
-- is added alongside. Together they give a real dedup key for both shapes.
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  candidate_id uuid not null references public.candidates(user_id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  origin text not null check (origin in ('ae_initiated', 'company_initiated')),
  ae_consent text not null check (ae_consent in ('standing', 'explicit', 'pending')),
  company_consent text not null
    check (company_consent in ('standing', 'explicit', 'pending')),
  status text not null
    check (status in ('resolved', 'pending_ae', 'pending_company', 'declined', 'expired')),
  conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (company_id, candidate_id, job_id)
);
create index if not exists matches_company_status_idx
  on public.matches (company_id, status);
create index if not exists matches_candidate_status_idx
  on public.matches (candidate_id, status);
-- partial unique index: a general talent match (job_id NULL) is unique per
-- (company, candidate) — the plain UNIQUE above does not dedup NULL job_id.
create unique index if not exists matches_general_talent_uniq
  on public.matches (company_id, candidate_id)
  where job_id is null;

-- ---------- notifications.kind — add the cycle-6 match kinds ----------
-- 0001 created notifications.kind with a fixed 5-value CHECK. The consent
-- engine fires `match_pending` (the side that must act) and `match_resolved`
-- (both sides, on resolution). Drop and recreate the CHECK with the two new
-- kinds added. `drop constraint if exists` + recreate is idempotent.
alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in (
    'unlock_requested', 'unlock_accepted', 'unlock_declined',
    'credential_verified', 'subscription_updated',
    'match_pending', 'match_resolved'
  ));

-- ---------- RLS deny-all on the new tables ----------
-- Enable RLS, create no policies — anon/authenticated are denied; the BFF uses
-- the service role, which bypasses RLS (the 0001-0004 convention). Defense in
-- depth is the WHERE clauses in BFF code.
alter table public.company_match_criteria enable row level security;
alter table public.matches enable row level security;

commit;
