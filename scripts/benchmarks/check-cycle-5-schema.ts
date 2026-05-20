#!/usr/bin/env tsx
/**
 * check-cycle-5-schema.ts
 *
 * Criteria 4 + 5 verifier for /scope cycle `ae-hq-jobs-as-objects`.
 *
 * Connects via `AE_DB_DIRECT_URL` and asserts the cycle-5 migration
 * (`0004_*.sql`) landed correctly AND the cycle-5 seed populated the
 * `applications` table to spec. Pure post-state assertion — the verifier
 * applies the migration and runs the seed before invoking this.
 *
 * Schema (criterion 4):
 *   1. `public.applications` exists with columns:
 *        id              uuid
 *        job_id          uuid   (FK -> jobs.id)
 *        candidate_id    uuid   (FK -> candidates.user_id)
 *        stage_id        uuid   (FK -> pipeline_stages.id)
 *        status          text   (applied|in_pipeline|rejected|withdrawn|hired)
 *        source          text   (candidate_applied|company_sourced)
 *        created_at      timestamptz
 *        updated_at      timestamptz
 *   2. `applications` has a UNIQUE constraint / index over (job_id, candidate_id)
 *      — the idempotency key for apply.
 *   3. `applications` has RLS ENABLED (cycle-1..4 deny-all convention).
 *   4. `pipeline_activity` has a NEW `application_id` column, and it is
 *      NULLABLE. AND — load-bearing — `pipeline_activity.pipeline_candidate_id`
 *      must now be NULLABLE too: an activity row written for a per-job
 *      application has an application_id but NO pipeline_candidate. If 0004
 *      adds application_id but leaves pipeline_candidate_id NOT NULL, per-job
 *      pipeline activity cannot be inserted. This is the migration's sharpest
 *      edge — assert it explicitly.
 *   5. `pipeline_candidates` STILL EXISTS (the directive says keep it; a
 *      migration that dropped it is a hard fail).
 *   6. Pre-existing tables jobs / companies / pipeline_stages untouched
 *      (sampled: jobs still has company_id; companies still has the cycle-4
 *      firmographic columns — proves 0001-0003 were not re-run destructively).
 *
 * Seed (criterion 5):
 *   7. >= ~100 applications present (directive says ~120; >=100 tolerates
 *      seed-distribution variance).
 *   8. Applications span >= 2 distinct `status` values and BOTH `source`
 *      values (candidate_applied AND company_sourced).
 *   9. The test candidate (candidate1) has >= 3 applications.
 *  10. The test recruiter's company (Stripe) has >= 4 job postings, and
 *      Stripe postings collectively have applicants (>0 applications).
 *  11. Every application's (job_id, candidate_id) pair is unique (the UNIQUE
 *      constraint holds against the seeded data — no idempotency violation).
 *
 * Required env:
 *   AE_DB_DIRECT_URL
 *   TEST_CANDIDATE_EMAIL  (default candidate1@accountexecutive.test)
 *
 * Exit codes:
 *   0 — schema + seed sound
 *   1 — at least one assertion failed
 *   2 — AE_DB_DIRECT_URL not set / cannot connect
 */

import postgres from "postgres";

const DB_URL = process.env.AE_DB_DIRECT_URL;
if (!DB_URL) {
  console.error("FAIL: AE_DB_DIRECT_URL not set (source .env.local)");
  process.exit(2);
}
const CAND_EMAIL = process.env.TEST_CANDIDATE_EMAIL ?? "candidate1@accountexecutive.test";

const VALID_STATUS = ["applied", "in_pipeline", "rejected", "withdrawn", "hired"];
const VALID_SOURCE = ["candidate_applied", "company_sourced"];

// [column, expected data_type substring].
const APP_COLUMNS: ReadonlyArray<[string, string]> = [
  ["id", "uuid"],
  ["job_id", "uuid"],
  ["candidate_id", "uuid"],
  ["stage_id", "uuid"],
  ["status", "text"],
  ["source", "text"],
  ["created_at", "timestamp"],
  ["updated_at", "timestamp"],
];

const sql = postgres(DB_URL, { ssl: "prefer", max: 1 });

let failed = false;
function fail(msg: string) {
  console.error(`  FAIL  ${msg}`);
  failed = true;
}
function ok(msg: string) {
  console.log(`  ok    ${msg}`);
}

async function main() {
  // ── 1. applications columns + types ───────────────────────────────────────
  const appCols = await sql<{ column_name: string; data_type: string; is_nullable: string }[]>`
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'applications'
  `;
  if (appCols.length === 0) {
    fail("public.applications does not exist — migration 0004 not applied");
    await sql.end({ timeout: 5 });
    console.error("\nFAIL: applications table missing — remaining checks meaningless");
    process.exit(1);
  }
  const appColMap = new Map(appCols.map((r) => [r.column_name, r.data_type]));
  for (const [name, expected] of APP_COLUMNS) {
    const dt = appColMap.get(name);
    if (!dt) {
      fail(`applications.${name} — column missing`);
    } else if (!dt.toLowerCase().includes(expected.toLowerCase())) {
      fail(`applications.${name} — type "${dt}", expected to contain "${expected}"`);
    } else {
      ok(`applications.${name} (${dt})`);
    }
  }

  // ── 2. UNIQUE(job_id, candidate_id) ───────────────────────────────────────
  const uniq = await sql<{ idxdef: string }[]>`
    select indexdef as idxdef
    from pg_indexes
    where schemaname = 'public' and tablename = 'applications'
  `;
  const hasUniquePair = uniq.some(
    (r) =>
      /unique/i.test(r.idxdef) &&
      /\bjob_id\b/.test(r.idxdef) &&
      /\bcandidate_id\b/.test(r.idxdef),
  );
  if (hasUniquePair) {
    ok("applications has a UNIQUE index over (job_id, candidate_id)");
  } else {
    fail("applications is missing a UNIQUE(job_id, candidate_id) constraint — apply idempotency key");
  }

  // ── 3. applications RLS enabled ───────────────────────────────────────────
  const appRls = await sql<{ relrowsecurity: boolean }[]>`
    select c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'applications'
  `;
  if (appRls[0]?.relrowsecurity === true) {
    ok("applications RLS enabled");
  } else {
    fail("applications RLS is NOT enabled — cycle-1..4 deny-all convention broken");
  }

  // ── 4. pipeline_activity.application_id nullable + pipeline_candidate_id
  //      RELAXED to nullable ────────────────────────────────────────────────
  const paCols = await sql<{ column_name: string; is_nullable: string }[]>`
    select column_name, is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'pipeline_activity'
  `;
  const paMap = new Map(paCols.map((r) => [r.column_name, r.is_nullable]));
  if (!paMap.has("application_id")) {
    fail("pipeline_activity.application_id — new column missing (migration 0004)");
  } else if (paMap.get("application_id") !== "YES") {
    fail("pipeline_activity.application_id must be NULLABLE (rows for pipeline_candidates have none)");
  } else {
    ok("pipeline_activity.application_id present and nullable");
  }
  if (!paMap.has("pipeline_candidate_id")) {
    fail("pipeline_activity.pipeline_candidate_id — column vanished (must be kept)");
  } else if (paMap.get("pipeline_candidate_id") !== "YES") {
    fail(
      "pipeline_activity.pipeline_candidate_id is still NOT NULL — migration 0004 must RELAX it " +
        "to nullable, otherwise a per-job application's activity row (application_id set, " +
        "pipeline_candidate_id null) cannot be inserted",
    );
  } else {
    ok("pipeline_activity.pipeline_candidate_id relaxed to nullable");
  }

  // ── 5. pipeline_candidates still exists ───────────────────────────────────
  const pc = await sql<{ n: number }[]>`
    select count(*)::int as n
    from information_schema.tables
    where table_schema = 'public' and table_name = 'pipeline_candidates'
  `;
  if ((pc[0]?.n ?? 0) === 1) {
    ok("pipeline_candidates table preserved");
  } else {
    fail("pipeline_candidates table is GONE — the directive says KEEP it (cycle-3 data lives here)");
  }

  // ── 6. 0001-0003 not re-run destructively (sampled) ──────────────────────
  const jobsCol = await sql<{ n: number }[]>`
    select count(*)::int as n from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = 'company_id'
  `;
  const coCols = await sql<{ n: number }[]>`
    select count(*)::int as n from information_schema.columns
    where table_schema = 'public' and table_name = 'companies'
      and column_name in ('sales_motion','founded_year','investors','employee_count')
  `;
  if ((jobsCol[0]?.n ?? 0) === 1 && (coCols[0]?.n ?? 0) === 4) {
    ok("0001-0003 schema intact (jobs.company_id + 4 cycle-4 firmographic columns present)");
  } else {
    fail(
      `pre-cycle-5 schema drifted (jobs.company_id=${jobsCol[0]?.n}, ` +
        `companies firmographic cols=${coCols[0]?.n}/4) — 0004 must be purely additive`,
    );
  }

  // Short-circuit if schema is unsound — seed checks would be noise.
  if (failed) {
    await sql.end({ timeout: 5 });
    console.error("\nFAIL: cycle-5 schema not sound — skipping seed checks");
    process.exit(1);
  }

  // ── 7. ~120 applications ──────────────────────────────────────────────────
  const total = await sql<{ n: number }[]>`select count(*)::int as n from public.applications`;
  const appCount = total[0]?.n ?? 0;
  if (appCount >= 100) {
    ok(`${appCount} applications seeded (directive target ~120)`);
  } else {
    fail(`only ${appCount} applications seeded — directive requires ~120 (>=100 to pass)`);
  }

  // ── 8. status + source variety ────────────────────────────────────────────
  const statuses = await sql<{ status: string }[]>`
    select distinct status from public.applications
  `;
  const sources = await sql<{ source: string }[]>`
    select distinct source from public.applications
  `;
  const statusVals = statuses.map((r) => r.status);
  const sourceVals = sources.map((r) => r.source);
  const badStatus = statusVals.filter((s) => !VALID_STATUS.includes(s));
  const badSource = sourceVals.filter((s) => !VALID_SOURCE.includes(s));
  if (badStatus.length > 0) fail(`invalid application status value(s): ${badStatus.join(", ")}`);
  if (badSource.length > 0) fail(`invalid application source value(s): ${badSource.join(", ")}`);
  if (statusVals.length >= 2) {
    ok(`applications span ${statusVals.length} status values`);
  } else {
    fail(`applications use only ${statusVals.length} status value(s) — need varied stages/statuses`);
  }
  if (VALID_SOURCE.every((s) => sourceVals.includes(s))) {
    ok("applications include both candidate_applied AND company_sourced");
  } else {
    fail(`applications missing a source value — present: [${sourceVals.join(", ")}]`);
  }

  // ── 9. candidate1 has >= 3 applications ──────────────────────────────────
  const candApps = await sql<{ n: number }[]>`
    select count(*)::int as n
    from public.applications a
    join auth.users u on u.id = a.candidate_id
    where u.email = ${CAND_EMAIL}
  `;
  const candAppCount = candApps[0]?.n ?? 0;
  if (candAppCount >= 3) {
    ok(`${CAND_EMAIL} has ${candAppCount} applications`);
  } else {
    fail(`${CAND_EMAIL} has only ${candAppCount} applications — directive requires >= 3`);
  }

  // ── 10. Stripe has >= 4 postings, and its postings have applicants ───────
  const stripeJobs = await sql<{ n: number }[]>`
    select count(*)::int as n
    from public.jobs j
    join public.companies c on c.id = j.company_id
    where c.slug = 'stripe'
  `;
  const stripeApps = await sql<{ n: number }[]>`
    select count(*)::int as n
    from public.applications a
    join public.jobs j on j.id = a.job_id
    join public.companies c on c.id = j.company_id
    where c.slug = 'stripe'
  `;
  const sj = stripeJobs[0]?.n ?? 0;
  const sa = stripeApps[0]?.n ?? 0;
  if (sj >= 4) {
    ok(`Stripe has ${sj} job postings`);
  } else {
    fail(`Stripe has only ${sj} job postings — directive requires >= 4 (with applicants)`);
  }
  if (sa > 0) {
    ok(`Stripe postings have ${sa} applications across them`);
  } else {
    fail("Stripe postings have NO applications — the recruiter's per-job board would be empty");
  }

  // ── 11. (job_id, candidate_id) uniqueness holds against seeded data ──────
  const dupes = await sql<{ n: number }[]>`
    select count(*)::int as n from (
      select job_id, candidate_id
      from public.applications
      group by job_id, candidate_id
      having count(*) > 1
    ) d
  `;
  if ((dupes[0]?.n ?? 0) === 0) {
    ok("no duplicate (job_id, candidate_id) pairs — seed respects the idempotency key");
  } else {
    fail(`${dupes[0]?.n} duplicate (job_id, candidate_id) pair(s) in applications`);
  }

  await sql.end({ timeout: 5 });

  if (failed) {
    console.error("\nFAIL: cycle-5 schema/seed check did not pass");
    process.exit(1);
  }
  console.log(
    `OK: applications table sound (RLS, UNIQUE pair); pipeline_activity dual-FK relaxed; ` +
      `${appCount} applications seeded with variety`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(`FAIL: cycle-5 schema check threw: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
