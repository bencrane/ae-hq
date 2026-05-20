-- ae-hq cycle 5 schema — applications: a job posting becomes a first-class object
-- with its own application funnel.
--
-- ADDITIVE migration. Does NOT drop or alter anything from 0001/0002/0003 except
-- a single, deliberate NOT NULL relaxation on `pipeline_activity.pipeline_candidate_id`
-- (see below). Every object uses `create table if not exists` / `add column if not
-- exists`, and constraints are guarded by a catalog check, so a re-run is safe.
--
-- Data model (cycle 5):
--   `pipeline_candidates` (cycle 3, company-wide) is KEPT untouched — the cycle-3
--   sourced-candidate flow and the /co/pipeline cross-job board still read it.
--   `applications` (NEW, per-job) is the per-job funnel: one row = one candidate
--   in one job posting's pipeline. `pipeline_stages` stays company-scoped — every
--   job pipeline of a company shares that company's one stage set.
--
--   `pipeline_activity` gains a NULLABLE `application_id` alongside the existing
--   `pipeline_candidate_id`: an activity row references EITHER a pipeline_candidate
--   (cycle-3 board) OR an application (per-job board). Because a per-job activity
--   row has an `application_id` and NO pipeline_candidate, `pipeline_candidate_id`
--   MUST be relaxed from NOT NULL to nullable — otherwise the per-job move insert
--   fails. That relaxation is the migration's sharpest edge.

begin;

-- ---------- applications ----------
-- One candidate's application to one specific job posting. The per-job pipeline
-- (/co/jobs/:id) reads this table; the cycle-3 company-wide board does not.
--
-- FK ordering: this table's three inbound FKs (job_id, candidate_id, stage_id)
-- all reference tables created in 0001/0002, so `applications` can be created
-- first; the `pipeline_activity.application_id` FK below then references it.
-- `candidate_id` references candidates.user_id — the candidates PK is `user_id`,
-- NOT `id`. status/source are text + CHECK (the 0001/0003 pattern — no PG enum).
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  candidate_id uuid not null references public.candidates(user_id) on delete cascade,
  stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  status text not null default 'applied'
    check (status in ('applied', 'in_pipeline', 'rejected', 'withdrawn', 'hired')),
  source text not null
    check (source in ('candidate_applied', 'company_sourced')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- the apply idempotency key: a candidate can apply to a job at most once.
  unique (job_id, candidate_id)
);
create index if not exists applications_job_idx on public.applications (job_id);
create index if not exists applications_candidate_idx on public.applications (candidate_id);
create index if not exists applications_job_stage_idx on public.applications (job_id, stage_id);

-- ---------- pipeline_activity.application_id ----------
-- A NULLABLE FK to applications. An activity row written for a per-job
-- application sets `application_id` and leaves `pipeline_candidate_id` null.
alter table public.pipeline_activity
  add column if not exists application_id uuid references public.applications(id) on delete cascade;
create index if not exists pipeline_activity_application_created_idx
  on public.pipeline_activity (application_id, created_at);

-- ---------- relax pipeline_activity.pipeline_candidate_id to NULLABLE ----------
-- It is NOT NULL today (0002). A per-job application's activity row has an
-- `application_id` and NO pipeline_candidate, so inserting it would violate the
-- old NOT NULL constraint. Relax the column. `drop not null` is idempotent — a
-- re-run on an already-nullable column is a no-op.
alter table public.pipeline_activity
  alter column pipeline_candidate_id drop not null;

-- A per-job vs company-wide activity row references EXACTLY ONE of the two
-- subjects. Guarded by a catalog check so a re-run does not throw
-- `constraint already exists`.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pipeline_activity_subject_check'
      and conrelid = 'public.pipeline_activity'::regclass
  ) then
    alter table public.pipeline_activity
      add constraint pipeline_activity_subject_check
      check (
        (pipeline_candidate_id is not null and application_id is null)
        or (pipeline_candidate_id is null and application_id is not null)
      );
  end if;
end $$;

-- ---------- RLS deny-all on applications ----------
-- Enable RLS, create no policies — anon/authenticated are denied; the BFF uses
-- the service role, which bypasses RLS (the 0001/0002/0003 convention).
alter table public.applications enable row level security;

commit;
