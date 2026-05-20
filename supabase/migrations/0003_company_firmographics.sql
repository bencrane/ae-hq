-- ae-hq cycle 4 schema — company firmographics (sales motion, founding, investors, headcount)
-- ADDITIVE migration. Does NOT drop or alter anything from 0001/0002.
-- Every column uses `ADD COLUMN IF NOT EXISTS` so a re-run is safe. `companies.stage`
-- (funding stage) is preserved untouched. RLS on `companies` is left enabled
-- (cycle-1 deny-all convention) — this migration adds columns only.
--
-- These columns are the foundation for cycle 5/6: candidate sales-motion is derived
-- from the motions of the companies in a candidate's work history, and the investor
-- dimension powers cycle-6 "all <VC>-backed" style criteria.

begin;

-- sales_motion: how the company sells. A text column + CHECK, mirroring the
-- existing `stage` / `size_range` pattern on this table (no PG enum type).
alter table public.companies
  add column if not exists sales_motion text;

-- founded_year: the year the company was founded.
alter table public.companies
  add column if not exists founded_year integer;

-- investors: named VC firms on the cap table (real firm names, e.g. {"Sequoia"}).
alter table public.companies
  add column if not exists investors text[] not null default array[]::text[];

-- employee_count: approximate headcount.
alter table public.companies
  add column if not exists employee_count integer;

-- Guard sales_motion to the four allowed motions. Added separately and guarded
-- by a catalog check so a re-run does not throw `constraint already exists`.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'companies_sales_motion_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_sales_motion_check
      check (sales_motion is null or sales_motion in ('plg', 'sales_led', 'enterprise', 'hybrid'));
  end if;
end $$;

-- RLS on companies remains enabled (deny-all, no policies). The BFF uses the
-- service role, which bypasses RLS. This migration adds columns only — it does
-- NOT touch row-level security. Re-asserted here as documentation/defense.
alter table public.companies enable row level security;

commit;
