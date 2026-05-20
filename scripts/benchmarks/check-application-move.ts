#!/usr/bin/env tsx
/**
 * check-application-move.ts
 *
 * Criterion 13 verifier (the side-effect half) for cycle `ae-hq-jobs-as-objects`.
 *
 * The e2e drag (e2e/cycle-5.spec.ts) proves an application card MOVES between
 * columns in the per-job kanban UI. This scripted check proves the SIDE
 * EFFECT — moving an application between stages persists the new stage AND
 * writes a `pipeline_activity` row that references the `application_id`.
 *
 * Strategy (API drives the move, DB confirms the side effect):
 *   1. Mint a recruiter access token (Supabase password grant). That user's
 *      company is Stripe (seeded).
 *   2. GET /api/v1/company/jobs — pick a Stripe posting that has applicants.
 *   3. GET /api/v1/company/jobs/:id/pipeline — read the stages and the
 *      applications grouped by stage. Pick one application and a DESTINATION
 *      stage different from its current stage.
 *   4. BEFORE the move: read, directly from the DB, (a) that application's
 *      current stage_id and (b) the count of `pipeline_activity` rows whose
 *      `application_id` equals it.
 *   5. POST /api/v1/company/jobs/:id/applications/:applicationId/move with
 *      the destination stage.
 *   6. Assert:
 *        a. the move endpoint returned 2xx
 *        b. the application's stage_id in the DB now equals the destination
 *        c. a NEW pipeline_activity row exists with application_id = that
 *           application (count strictly increased) — proving per-job
 *           activity is logged against application_id, not pipeline_candidate_id
 *        d. that new row's pipeline_candidate_id is NULL (a per-job activity
 *           row is keyed on application_id) — soft check, warns only
 *   7. Move the application BACK to its original stage (idempotent re-runs).
 *
 * Required env:
 *   API_URL, AE_SUPABASE_URL|VITE_SUPABASE_URL,
 *   AE_SUPABASE_ANON_KEY|VITE_SUPABASE_PUBLISHABLE_KEY, AE_DB_DIRECT_URL,
 *   TEST_RECRUITER_EMAIL (default recruiter1@stripe.test), TEST_PASSWORD
 *
 * Exit codes:
 *   0 — move persisted the stage and wrote an application-keyed activity row
 *   1 — move did not produce the expected DB side effect
 *   2 — could not authenticate / no per-job pipeline data / request errored
 */

import postgres from "postgres";

const API_URL = process.env.API_URL ?? "http://localhost:8080";
const SUPABASE_URL = process.env.AE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const ANON_KEY =
  process.env.AE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.AE_DB_DIRECT_URL;
const REC_EMAIL = process.env.TEST_RECRUITER_EMAIL ?? "recruiter1@stripe.test";
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
  throw new Error(msg); // unreachable, satisfies the type checker
}

async function mintToken(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY as string },
    body: JSON.stringify({ email: REC_EMAIL, password: PASSWORD }),
  });
  if (!res.ok) die(2, `FAIL: auth failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) die(2, "FAIL: auth response had no access_token");
  return json.access_token as string;
}

/** Extract the first string-valued key from a candidate set. */
function pickStr(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

async function main() {
  const token = await mintToken();
  const authHeaders = { Authorization: `Bearer ${token}` };

  // ── 2. find a Stripe posting with applicants ─────────────────────────────
  const jobsRes = await fetch(`${API_URL}/api/v1/company/jobs`, { headers: authHeaders });
  if (!jobsRes.ok) {
    die(2, `FAIL: GET /api/v1/company/jobs -> ${jobsRes.status}: ${await jobsRes.text()}`);
  }
  const jobsBody = (await jobsRes.json()) as unknown;
  const jobRows: Record<string, unknown>[] = Array.isArray(jobsBody)
    ? (jobsBody as Record<string, unknown>[])
    : ((jobsBody as { jobs?: Record<string, unknown>[]; data?: Record<string, unknown>[] })
        ?.jobs ??
      (jobsBody as { data?: Record<string, unknown>[] })?.data ??
      []);
  if (jobRows.length === 0) die(2, "FAIL: /api/v1/company/jobs returned no postings");

  // Probe each posting's per-job pipeline until we find one with >=1
  // application AND >=2 stages so a move is possible.
  let chosenJobId = "";
  let applicationId = "";
  let fromStageId = "";
  let toStageId = "";

  for (const jr of jobRows) {
    const jid =
      pickStr(jr, ["id", "job_id", "jobId"]) ??
      (jr.job && typeof jr.job === "object"
        ? pickStr(jr.job as Record<string, unknown>, ["id"])
        : null);
    if (!jid) continue;

    const pipeRes = await fetch(`${API_URL}/api/v1/company/jobs/${jid}/pipeline`, {
      headers: authHeaders,
    });
    if (!pipeRes.ok) continue;
    const pipe = (await pipeRes.json()) as unknown;

    // The response shapes we tolerate: { stages: [{id, applications:[{id,stage_id}]}] }
    // or { columns: [...] } or a flat { stages:[...], applications:[...] }.
    const stages: Record<string, unknown>[] =
      (pipe as { stages?: Record<string, unknown>[] })?.stages ??
      (pipe as { columns?: Record<string, unknown>[] })?.columns ??
      [];
    const stageIds = stages
      .map((s) => pickStr(s, ["id", "stage_id", "stageId"]))
      .filter((x): x is string => !!x);
    if (stageIds.length < 2) continue;

    // collect applications either nested in stages or in a flat array
    const flatApps: Record<string, unknown>[] =
      (pipe as { applications?: Record<string, unknown>[] })?.applications ?? [];
    const nestedApps: { appId: string; stageId: string }[] = [];
    for (const s of stages) {
      const sid = pickStr(s, ["id", "stage_id", "stageId"]);
      const apps =
        (s as { applications?: Record<string, unknown>[] })?.applications ??
        (s as { cards?: Record<string, unknown>[] })?.cards ??
        [];
      for (const a of apps) {
        const aid = pickStr(a, ["id", "application_id", "applicationId"]);
        if (aid && sid) nestedApps.push({ appId: aid, stageId: sid });
      }
    }
    const candidates =
      nestedApps.length > 0
        ? nestedApps
        : flatApps
            .map((a) => ({
              appId: pickStr(a, ["id", "application_id", "applicationId"]) ?? "",
              stageId: pickStr(a, ["stage_id", "stageId"]) ?? "",
            }))
            .filter((x) => x.appId && x.stageId);

    if (candidates.length === 0) continue;

    const app = candidates[0];
    chosenJobId = jid;
    applicationId = app.appId;
    fromStageId = app.stageId;
    toStageId = stageIds.find((s) => s !== fromStageId) ?? "";
    if (chosenJobId && applicationId && fromStageId && toStageId) break;
    chosenJobId = "";
  }

  if (!chosenJobId || !applicationId || !toStageId) {
    die(2, "FAIL: found no job whose per-job pipeline has a movable application + 2 stages");
  }
  console.log(`  ok    target job=${chosenJobId} application=${applicationId}`);
  console.log(`  ok    moving ${fromStageId} -> ${toStageId}`);

  // ── 4. BEFORE state from the DB ──────────────────────────────────────────
  const before = await sql<{ stage_id: string }[]>`
    select stage_id::text from public.applications where id = ${applicationId}
  `;
  const dbFromStage = before[0]?.stage_id;
  if (!dbFromStage) die(2, `FAIL: application ${applicationId} not found in DB`);

  const beforeAct = await sql<{ n: number }[]>`
    select count(*)::int as n from public.pipeline_activity
    where application_id = ${applicationId}
  `;
  const beforeCount = beforeAct[0]?.n ?? 0;

  // ── 5. POST the move ─────────────────────────────────────────────────────
  const moveUrl =
    `${API_URL}/api/v1/company/jobs/${chosenJobId}/applications/${applicationId}/move`;
  // tolerate either { stage_id } or { stageId } or { to_stage_id } body keys —
  // try the most likely first, fall back on a 4xx.
  const bodies = [
    { stage_id: toStageId },
    { stageId: toStageId },
    { to_stage_id: toStageId },
    { toStageId: toStageId },
  ];
  let moveOk = false;
  let lastStatus = 0;
  let lastText = "";
  for (const b of bodies) {
    const res = await fetch(moveUrl, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    lastStatus = res.status;
    lastText = await res.text();
    if (res.ok) {
      moveOk = true;
      break;
    }
    // a 422/400 means wrong body key — keep trying; a 401/403/404/500 is fatal
    if (![400, 422].includes(res.status)) break;
  }
  if (!moveOk) {
    die(1, `FAIL: move endpoint did not accept the request (last ${lastStatus}): ${lastText}`);
  }
  console.log("  ok    move endpoint returned 2xx");

  // ── 6. assert the side effects ───────────────────────────────────────────
  let failed = false;
  const after = await sql<{ stage_id: string }[]>`
    select stage_id::text from public.applications where id = ${applicationId}
  `;
  if (after[0]?.stage_id === toStageId) {
    console.log("  ok    application.stage_id persisted to the destination stage");
  } else {
    console.error(
      `  FAIL  application.stage_id is "${after[0]?.stage_id}", expected "${toStageId}"`,
    );
    failed = true;
  }

  const afterAct = await sql<
    { n: number; latest_pc: string | null }[]
  >`
    select count(*)::int as n,
           (select pipeline_candidate_id::text from public.pipeline_activity
             where application_id = ${applicationId}
             order by created_at desc limit 1) as latest_pc
    from public.pipeline_activity
    where application_id = ${applicationId}
  `;
  const afterCount = afterAct[0]?.n ?? 0;
  if (afterCount > beforeCount) {
    console.log(
      `  ok    pipeline_activity row written for application_id (${beforeCount} -> ${afterCount})`,
    );
  } else {
    console.error(
      `  FAIL  no new pipeline_activity row keyed on application_id ` +
        `(${beforeCount} -> ${afterCount}) — per-job move did not log activity`,
    );
    failed = true;
  }
  // soft: the per-job activity row should be application-keyed only
  if (afterAct[0]?.latest_pc != null) {
    console.error(
      `  warn  newest application activity row also has pipeline_candidate_id=` +
        `${afterAct[0]?.latest_pc} — a per-job activity row should be keyed on application_id alone`,
    );
  }

  // ── 7. move back (leave the seed clean-ish) ──────────────────────────────
  for (const b of [
    { stage_id: dbFromStage },
    { stageId: dbFromStage },
    { to_stage_id: dbFromStage },
    { toStageId: dbFromStage },
  ]) {
    const res = await fetch(moveUrl, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    if (res.ok) break;
    if (![400, 422].includes(res.status)) break;
  }

  await sql.end({ timeout: 5 });
  if (failed) {
    console.error("\nFAIL: per-job application move did not produce the expected side effects");
    process.exit(1);
  }
  console.log("OK: application move persists the stage + writes an application-keyed activity row");
  process.exit(0);
}

main().catch((e) => {
  console.error(`FAIL: application-move check threw: ${e instanceof Error ? e.message : String(e)}`);
  sql.end({ timeout: 5 }).finally(() => process.exit(2));
});
