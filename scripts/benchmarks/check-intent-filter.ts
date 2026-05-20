#!/usr/bin/env tsx
/**
 * check-intent-filter.ts
 *
 * Criterion 14 verifier — the authed-candidate `for_me` job feed is a
 * strict, correct subset of the full feed.
 *
 * Strategy (API-level, deterministic — no DOM):
 *   1. Mint a candidate access token by signing in via the Supabase auth
 *      REST endpoint (password grant) as TEST_CANDIDATE_EMAIL.
 *   2. GET /api/v1/jobs (no for_me)              -> FULL set
 *   3. Snapshot the candidate's current intent (to restore afterwards).
 *   4. PUT /api/v1/candidates/me/intent with a DELIBERATELY NARROW signal:
 *      a single target_segment that is known to match only some jobs.
 *   5. GET /api/v1/jobs?for_me=true              -> FILTERED set
 *   6. Assertions:
 *        a. FILTERED ⊆ FULL                       (strict subset by job id)
 *        b. |FILTERED| < |FULL|                   (the narrow filter shrank it)
 *        c. |FILTERED| >= 1                       (filter is not degenerate)
 *        d. every job in FILTERED has segment == the narrow target_segment
 *   7. Empty-intent guard: PUT a fully-empty intent, GET ?for_me=true,
 *      assert it does NOT 500 and returns >= the filtered count
 *      (empty intent must degrade gracefully — directive non-goal is a
 *      ranking algo, so empty intent should mean "no narrowing").
 *   8. Restore the original intent.
 *
 * Required env:
 *   API_URL                 (default http://localhost:8080)
 *   AE_SUPABASE_URL         (Supabase project URL — for the auth grant)
 *   VITE_SUPABASE_URL       (fallback for AE_SUPABASE_URL)
 *   AE_SUPABASE_ANON_KEY    (anon/publishable key — for the auth grant)
 *   VITE_SUPABASE_PUBLISHABLE_KEY (fallback)
 *   TEST_CANDIDATE_EMAIL    (default candidate1@accountexecutive.test)
 *   TEST_PASSWORD           (default testing123!)
 *
 * Exit codes:
 *   0 — for_me filter produces a correct strict subset; empty intent safe
 *   1 — a subset/correctness assertion failed
 *   2 — could not authenticate or a request errored
 */

const API_URL = process.env.API_URL ?? "http://localhost:8080";
const SUPABASE_URL = process.env.AE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const ANON_KEY =
  process.env.AE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const CAND_EMAIL = process.env.TEST_CANDIDATE_EMAIL ?? "candidate1@accountexecutive.test";
const PASSWORD = process.env.TEST_PASSWORD ?? "testing123!";

// The narrow segment used to shrink the feed. Must be one of the schema's
// segment enum values. SMB is typically the smallest slice of seeded jobs.
const NARROW_SEGMENT = process.env.INTENT_PROBE_SEGMENT ?? "SMB";

function die(msg: string, code: number): never {
  console.error(`FAIL: ${msg}`);
  process.exit(code);
}

async function getToken(): Promise<string> {
  if (!SUPABASE_URL || !ANON_KEY) {
    die("AE_SUPABASE_URL / anon key not set (source .env.local)", 2);
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: CAND_EMAIL, password: PASSWORD }),
  });
  if (!res.ok) die(`auth grant failed: ${res.status} ${await res.text()}`, 2);
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) die("auth grant returned no access_token", 2);
  return j.access_token;
}

async function jobIds(token: string, forMe: boolean): Promise<string[]> {
  const url = `${API_URL}/api/v1/jobs${forMe ? "?for_me=true" : ""}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) die(`GET ${url} -> ${res.status} ${await res.text()}`, 2);
  const j = (await res.json()) as { jobs?: Array<{ id: string; segment?: string }> };
  return (j.jobs ?? []).map((job) => job.id);
}

async function jobsFull(
  token: string,
  forMe: boolean,
): Promise<Array<{ id: string; segment?: string }>> {
  const url = `${API_URL}/api/v1/jobs${forMe ? "?for_me=true" : ""}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) die(`GET ${url} -> ${res.status} ${await res.text()}`, 2);
  const j = (await res.json()) as { jobs?: Array<{ id: string; segment?: string }> };
  return j.jobs ?? [];
}

async function getIntent(token: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${API_URL}/api/v1/candidates/me/intent`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) die(`GET intent -> ${res.status}`, 2);
  const j = (await res.json()) as { intent?: Record<string, unknown> | null };
  return j.intent ?? null;
}

async function putIntent(token: string, body: Record<string, unknown>): Promise<number> {
  const res = await fetch(`${API_URL}/api/v1/candidates/me/intent`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.status;
}

async function main() {
  const token = await getToken();

  // snapshot original intent so we can restore it
  const original = await getIntent(token);
  const restoreBody = {
    target_stages: (original?.target_stages as string[]) ?? [],
    target_segments: (original?.target_segments as string[]) ?? [],
    target_geos: (original?.target_geos as string[]) ?? [],
    target_companies: (original?.target_companies as string[]) ?? [],
    comp_ote_min: (original?.comp_ote_min as number | null) ?? null,
  };

  try {
    const full = await jobIds(token, false);
    if (full.length < 2) die(`full job feed too small to test subset (${full.length})`, 1);

    // narrow the intent to a single segment
    const putStatus = await putIntent(token, {
      target_stages: [],
      target_segments: [NARROW_SEGMENT],
      target_geos: [],
      target_companies: [],
      comp_ote_min: null,
    });
    if (putStatus < 200 || putStatus >= 300) die(`PUT narrow intent -> ${putStatus}`, 2);

    const filtered = await jobsFull(token, true);
    const filteredIds = new Set(filtered.map((j) => j.id));
    const fullSet = new Set(full);

    // a. strict subset
    for (const id of filteredIds) {
      if (!fullSet.has(id)) die(`for_me returned job ${id} not in the full feed`, 1);
    }
    // b. it actually shrank
    if (filtered.length >= full.length) {
      die(`for_me did not narrow the feed (full=${full.length}, filtered=${filtered.length})`, 1);
    }
    // c. not degenerate
    if (filtered.length < 1) {
      die(`for_me feed is empty for segment=${NARROW_SEGMENT} — filter too aggressive or seed gap`, 1);
    }
    // d. correctness: every filtered job matches the narrow segment
    const mismatched = filtered.filter((j) => j.segment && j.segment !== NARROW_SEGMENT);
    if (mismatched.length > 0) {
      die(
        `for_me returned ${mismatched.length} job(s) whose segment != ${NARROW_SEGMENT} ` +
          `(e.g. ${mismatched[0]?.id}:${mismatched[0]?.segment})`,
        1,
      );
    }

    // 7. empty-intent guard — must not 500, must not over-narrow
    const emptyStatus = await putIntent(token, {
      target_stages: [],
      target_segments: [],
      target_geos: [],
      target_companies: [],
      comp_ote_min: null,
    });
    if (emptyStatus < 200 || emptyStatus >= 300) die(`PUT empty intent -> ${emptyStatus}`, 2);
    const emptyFiltered = await jobIds(token, true);
    if (emptyFiltered.length < filtered.length) {
      die(
        `empty intent narrowed MORE than a real filter ` +
          `(empty=${emptyFiltered.length} < narrow=${filtered.length}) — empty intent not handled gracefully`,
        1,
      );
    }

    console.log(
      `OK: for_me filter is a strict correct subset ` +
        `(full=${full.length}, narrow[${NARROW_SEGMENT}]=${filtered.length}, empty-intent=${emptyFiltered.length})`,
    );
    process.exit(0);
  } finally {
    // restore original intent regardless of outcome
    await putIntent(token, restoreBody).catch(() => {});
  }
}

main().catch((e) => {
  console.error(`FAIL: intent filter check threw: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
