#!/usr/bin/env tsx
/**
 * check-pipeline-move.ts
 *
 * Criterion 13 verifier — moving a pipeline candidate writes a
 * `stage_changed` activity row.
 *
 * Strategy (API drives the move, DB confirms the side effect):
 *   1. Mint a recruiter access token (Supabase password grant) as
 *      TEST_RECRUITER_EMAIL — that user's company is Stripe (seeded).
 *   2. GET /api/v1/company/pipeline — read stages + candidates-by-stage.
 *      Pick a candidate and a DESTINATION stage different from its current.
 *   3. Count that candidate's `pipeline_activity` rows of kind
 *      'stage_changed' BEFORE the move (direct DB read via AE_DB_DIRECT_URL).
 *   4. POST /api/v1/company/pipeline/candidates/:candidateId/move
 *      with the destination stage.
 *   5. Assert:
 *        a. the move endpoint returned 2xx
 *        b. the candidate's stage_id in the DB now equals the destination
 *        c. a NEW 'stage_changed' pipeline_activity row exists for that
 *           candidate (count strictly increased)
 *        d. the new activity row's payload_json records the move
 *           (references a from/to stage — soft check, warns only)
 *   6. Move the candidate BACK to its original stage (leave seed clean-ish;
 *      this is a verifier, idempotent re-runs are expected).
 *
 * Required env:
 *   API_URL, AE_SUPABASE_URL|VITE_SUPABASE_URL, AE_SUPABASE_ANON_KEY|VITE_SUPABASE_PUBLISHABLE_KEY,
 *   AE_DB_DIRECT_URL, TEST_RECRUITER_EMAIL, TEST_PASSWORD
 *
 * Exit codes:
 *   0 — move succeeded and wrote a stage_changed activity row
 *   1 — move did not produce the expected DB side effect
 *   2 — could not authenticate / no pipeline data / request errored
 */

import postgres from "postgres";

const API_URL = process.env.API_URL ?? "http://localhost:8080";
const SUPABASE_URL = process.env.AE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const ANON_KEY =
  process.env.AE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const DB_URL = process.env.AE_DB_DIRECT_URL ?? "";
const REC_EMAIL = process.env.TEST_RECRUITER_EMAIL ?? "recruiter1@stripe.test";
const PASSWORD = process.env.TEST_PASSWORD ?? "testing123!";

function die(msg: string, code: number): never {
  console.error(`FAIL: ${msg}`);
  process.exit(code);
}

async function getToken(): Promise<string> {
  if (!SUPABASE_URL || !ANON_KEY) die("Supabase URL / anon key not set", 2);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: REC_EMAIL, password: PASSWORD }),
  });
  if (!res.ok) die(`auth grant failed: ${res.status} ${await res.text()}`, 2);
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) die("auth grant returned no access_token", 2);
  return j.access_token;
}

type Stage = { id: string; name: string; position: number };
type PipelineCandidate = { id: string; candidate_id: string; stage_id: string };

async function main() {
  if (!DB_URL) die("AE_DB_DIRECT_URL not set", 2);
  const token = await getToken();

  // 2. read the pipeline
  const pipeRes = await fetch(`${API_URL}/api/v1/company/pipeline`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!pipeRes.ok) die(`GET /company/pipeline -> ${pipeRes.status} ${await pipeRes.text()}`, 2);
  const pipe = (await pipeRes.json()) as {
    stages?: Stage[];
    // shape-tolerant: candidates may be grouped under stages or flat
    candidates?: PipelineCandidate[];
  } & Record<string, unknown>;

  const stages: Stage[] = pipe.stages ?? [];
  if (stages.length < 2) die(`need >=2 pipeline stages to test a move (got ${stages.length})`, 2);

  // collect candidates regardless of whether the API nests them under stages
  let candidates: PipelineCandidate[] = [];
  if (Array.isArray(pipe.candidates)) {
    candidates = pipe.candidates;
  } else {
    // grouped form: stages[].candidates[] OR a top-level map
    for (const s of stages as Array<Stage & { candidates?: PipelineCandidate[] }>) {
      if (Array.isArray(s.candidates)) {
        candidates.push(...s.candidates.map((c) => ({ ...c, stage_id: c.stage_id ?? s.id })));
      }
    }
  }
  if (candidates.length === 0) {
    // last resort: read directly from the DB
    const sqlPeek = postgres(DB_URL, { ssl: "prefer", max: 1 });
    try {
      const rows = await sqlPeek<PipelineCandidate[]>`
        select pc.id, pc.candidate_id, pc.stage_id
        from public.pipeline_candidates pc
        join public.pipeline_stages ps on ps.id = pc.stage_id
        limit 50
      `;
      candidates = rows;
    } finally {
      await sqlPeek.end({ timeout: 5 });
    }
  }
  if (candidates.length === 0) die("no pipeline candidates seeded — cannot test a move", 2);

  const subject = candidates[0]!;
  const fromStage = subject.stage_id;
  const destStage = stages.find((s) => s.id !== fromStage);
  if (!destStage) die("could not find a destination stage distinct from the candidate's", 2);

  const sql = postgres(DB_URL, { ssl: "prefer", max: 1 });
  try {
    // 3. count stage_changed activity BEFORE
    const beforeRows = await sql<{ n: string }[]>`
      select count(*)::text as n
      from public.pipeline_activity
      where pipeline_candidate_id = ${subject.id} and kind = 'stage_changed'
    `;
    const before = Number(beforeRows[0]?.n ?? "0");

    // 4. POST the move
    const moveRes = await fetch(
      `${API_URL}/api/v1/company/pipeline/candidates/${subject.candidate_id}/move`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: destStage.id }),
      },
    );
    if (moveRes.status < 200 || moveRes.status >= 300) {
      die(`move endpoint -> ${moveRes.status} ${await moveRes.text()}`, 1);
    }

    // 5b. stage actually changed in the DB
    const nowRows = await sql<{ stage_id: string }[]>`
      select stage_id from public.pipeline_candidates where id = ${subject.id}
    `;
    if (nowRows[0]?.stage_id !== destStage.id) {
      die(
        `candidate stage_id is ${nowRows[0]?.stage_id}, expected ${destStage.id} after move`,
        1,
      );
    }

    // 5c. a NEW stage_changed activity row exists
    const afterRows = await sql<{ n: string }[]>`
      select count(*)::text as n
      from public.pipeline_activity
      where pipeline_candidate_id = ${subject.id} and kind = 'stage_changed'
    `;
    const after = Number(afterRows[0]?.n ?? "0");
    if (after <= before) {
      die(`no new stage_changed activity row (before=${before}, after=${after})`, 1);
    }

    // 5d. soft check — payload references the move
    const latest = await sql<{ payload_json: unknown }[]>`
      select payload_json from public.pipeline_activity
      where pipeline_candidate_id = ${subject.id} and kind = 'stage_changed'
      order by created_at desc limit 1
    `;
    const payloadStr = JSON.stringify(latest[0]?.payload_json ?? {});
    const payloadOk = payloadStr.includes(destStage.id) || /stage/i.test(payloadStr);
    if (!payloadOk) {
      console.error(`  WARN: latest stage_changed payload does not reference the destination stage`);
    }

    // 6. move back
    await fetch(`${API_URL}/api/v1/company/pipeline/candidates/${subject.candidate_id}/move`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ stage_id: fromStage }),
    }).catch(() => {});

    console.log(
      `OK: pipeline move wrote a stage_changed activity row ` +
        `(candidate=${subject.candidate_id}, ${fromStage}→${destStage.id}, activity ${before}→${after})`,
    );
    process.exit(0);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(`FAIL: pipeline move check threw: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
