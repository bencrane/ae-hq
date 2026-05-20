#!/usr/bin/env tsx
/**
 * check-apply-idempotent.ts
 *
 * Criterion 11 verifier (the side-effect + idempotency half) for cycle
 * `ae-hq-jobs-as-objects`.
 *
 * The e2e test (e2e/cycle-5.spec.ts) proves the UI shows applied-state after
 * a candidate applies. This scripted check proves the API contract:
 *   - POST /api/v1/jobs/:id/apply creates exactly ONE `applications` row
 *   - re-POSTing the SAME job is a NO-OP (no second row, still 2xx — the
 *     directive says "re-applying is a no-op"; a 2xx idempotent response or
 *     a benign 409 both satisfy "no-op", but the ROW COUNT must not change)
 *   - the created row has source='candidate_applied' and a stage_id at the
 *     company's first pipeline stage
 *
 * Strategy:
 *   1. Mint a candidate access token (Supabase password grant) as
 *      TEST_CANDIDATE_EMAIL.
 *   2. Find a job the candidate has NOT applied to: GET /api/v1/jobs, then
 *      check the DB for an existing applications row; pick the first job
 *      with no row for this candidate.
 *   3. Count applications for (job, candidate) BEFORE = 0 (asserted).
 *   4. POST /api/v1/jobs/:id/apply  -> expect 2xx, count becomes 1.
 *   5. POST the SAME endpoint AGAIN -> expect 2xx OR 409; count STAYS 1.
 *   6. Assert the row: source='candidate_applied', stage_id is the company's
 *      lowest-position pipeline stage.
 *   7. CLEANUP — delete the row this check created, so the check is itself
 *      idempotent across re-runs (it always needs a not-yet-applied job).
 *
 * Required env:
 *   API_URL, AE_SUPABASE_URL|VITE_SUPABASE_URL,
 *   AE_SUPABASE_ANON_KEY|VITE_SUPABASE_PUBLISHABLE_KEY, AE_DB_DIRECT_URL,
 *   TEST_CANDIDATE_EMAIL (default candidate1@accountexecutive.test), TEST_PASSWORD
 *
 * Exit codes:
 *   0 — apply creates one row; re-apply is a no-op; row is well-formed
 *   1 — apply is not idempotent / row malformed
 *   2 — could not authenticate / no eligible job / request errored
 */

import postgres from "postgres";

const API_URL = process.env.API_URL ?? "http://localhost:8080";
const SUPABASE_URL = process.env.AE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const ANON_KEY =
  process.env.AE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.AE_DB_DIRECT_URL;
const CAND_EMAIL = process.env.TEST_CANDIDATE_EMAIL ?? "candidate1@accountexecutive.test";
const PASSWORD = process.env.TEST_PASSWORD ?? "testing123!";

if (!SUPABASE_URL || !ANON_KEY || !DB_URL) {
  console.error(
    "FAIL: need AE_SUPABASE_URL, AE_SUPABASE_ANON_KEY, AE_DB_DIRECT_URL (source .env.local)",
  );
  process.exit(2);
}

const sql = postgres(DB_URL, { ssl: "prefer", max: 1 });

function die(code: number, msg: string): never {
  console.error(msg);
  sql.end({ timeout: 5 }).finally(() => process.exit(code));
  throw new Error(msg);
}

async function mintToken(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY as string },
    body: JSON.stringify({ email: CAND_EMAIL, password: PASSWORD }),
  });
  if (!res.ok) die(2, `FAIL: auth failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) die(2, "FAIL: auth response had no access_token");
  return json.access_token as string;
}

async function applyOnce(
  jobId: string,
  token: string,
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${API_URL}/api/v1/jobs/${jobId}/apply`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  return { status: res.status, text: await res.text() };
}

async function main() {
  const token = await mintToken();

  // candidate user id
  const candRows = await sql<{ id: string }[]>`
    select id::text from auth.users where email = ${CAND_EMAIL}
  `;
  const candId = candRows[0]?.id;
  if (!candId) die(2, `FAIL: candidate ${CAND_EMAIL} not found in auth.users`);

  // ── 2. find a job the candidate has NOT applied to ───────────────────────
  const jobsRes = await fetch(`${API_URL}/api/v1/jobs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!jobsRes.ok) die(2, `FAIL: GET /api/v1/jobs -> ${jobsRes.status}: ${await jobsRes.text()}`);
  const jobsBody = (await jobsRes.json()) as unknown;
  const rows: Record<string, unknown>[] = Array.isArray(jobsBody)
    ? (jobsBody as Record<string, unknown>[])
    : ((jobsBody as { jobs?: Record<string, unknown>[]; data?: Record<string, unknown>[] })
        ?.jobs ??
      (jobsBody as { data?: Record<string, unknown>[] })?.data ??
      []);
  const jobIds = rows
    .map((r) => {
      const v = r.id ?? r.job_id ?? r.jobId;
      return typeof v === "string" ? v : null;
    })
    .filter((x): x is string => !!x);
  if (jobIds.length === 0) die(2, "FAIL: /api/v1/jobs returned no jobs");

  // pick the first job with no existing application row for this candidate
  let targetJob = "";
  for (const jid of jobIds) {
    const existing = await sql<{ n: number }[]>`
      select count(*)::int as n from public.applications
      where job_id = ${jid} and candidate_id = ${candId}
    `;
    if ((existing[0]?.n ?? 0) === 0) {
      targetJob = jid;
      break;
    }
  }
  if (!targetJob) {
    die(2, "FAIL: candidate already has an application for every job returned — cannot test apply");
  }
  console.log(`  ok    eligible job (no prior application): ${targetJob}`);

  // ── 3. before = 0 ────────────────────────────────────────────────────────
  const before = await sql<{ n: number }[]>`
    select count(*)::int as n from public.applications
    where job_id = ${targetJob} and candidate_id = ${candId}
  `;
  if ((before[0]?.n ?? 0) !== 0) die(1, "FAIL: precondition broken — application row already exists");

  let failed = false;

  // ── 4. first apply ───────────────────────────────────────────────────────
  const first = await applyOnce(targetJob, token);
  if (first.status < 200 || first.status >= 300) {
    die(1, `FAIL: first apply returned ${first.status}: ${first.text}`);
  }
  const afterFirst = await sql<{ n: number }[]>`
    select count(*)::int as n from public.applications
    where job_id = ${targetJob} and candidate_id = ${candId}
  `;
  if ((afterFirst[0]?.n ?? 0) === 1) {
    console.log("  ok    first apply created exactly one applications row");
  } else {
    console.error(`  FAIL  first apply produced ${afterFirst[0]?.n} rows, expected 1`);
    failed = true;
  }

  // ── 5. re-apply — must be a no-op ────────────────────────────────────────
  const second = await applyOnce(targetJob, token);
  const secondAcceptable =
    (second.status >= 200 && second.status < 300) || second.status === 409;
  if (!secondAcceptable) {
    console.error(
      `  FAIL  re-apply returned ${second.status} (expected 2xx no-op or 409): ${second.text}`,
    );
    failed = true;
  }
  const afterSecond = await sql<{ n: number }[]>`
    select count(*)::int as n from public.applications
    where job_id = ${targetJob} and candidate_id = ${candId}
  `;
  if ((afterSecond[0]?.n ?? 0) === 1) {
    console.log(`  ok    re-apply is a no-op (still 1 row, status ${second.status})`);
  } else {
    console.error(
      `  FAIL  re-apply changed the row count to ${afterSecond[0]?.n} — apply is NOT idempotent`,
    );
    failed = true;
  }

  // ── 6. row is well-formed ────────────────────────────────────────────────
  const row = await sql<
    { id: string; source: string; status: string; stage_id: string }[]
  >`
    select id::text, source, status, stage_id::text
    from public.applications
    where job_id = ${targetJob} and candidate_id = ${candId}
    limit 1
  `;
  const created = row[0];
  if (!created) {
    console.error("  FAIL  created application row could not be read back");
    failed = true;
  } else {
    if (created.source === "candidate_applied") {
      console.log("  ok    source = candidate_applied");
    } else {
      console.error(`  FAIL  source is "${created.source}", expected "candidate_applied"`);
      failed = true;
    }
    // stage_id must be the company's first (lowest-position) pipeline stage
    const firstStage = await sql<{ id: string }[]>`
      select ps.id::text
      from public.pipeline_stages ps
      join public.jobs j on j.company_id = ps.company_id
      where j.id = ${targetJob}
      order by ps.position asc
      limit 1
    `;
    if (firstStage[0]?.id && created.stage_id === firstStage[0].id) {
      console.log("  ok    stage_id is the company's first pipeline stage");
    } else {
      console.error(
        `  FAIL  stage_id "${created.stage_id}" is not the company's first stage ` +
          `"${firstStage[0]?.id}"`,
      );
      failed = true;
    }
  }

  // ── 7. cleanup — delete what this check created ──────────────────────────
  // remove activity rows first (FK), then the application
  await sql`
    delete from public.pipeline_activity
    where application_id in (
      select id from public.applications
      where job_id = ${targetJob} and candidate_id = ${candId}
    )
  `;
  await sql`
    delete from public.applications
    where job_id = ${targetJob} and candidate_id = ${candId}
  `;
  console.log("  ok    cleaned up the test application row (check is re-run safe)");

  await sql.end({ timeout: 5 });
  if (failed) {
    console.error("\nFAIL: apply is not idempotent / created row malformed");
    process.exit(1);
  }
  console.log("OK: apply creates one row, re-apply is a no-op, row well-formed");
  process.exit(0);
}

main().catch((e) => {
  console.error(`FAIL: apply-idempotent check threw: ${e instanceof Error ? e.message : String(e)}`);
  sql.end({ timeout: 5 }).finally(() => process.exit(2));
});
