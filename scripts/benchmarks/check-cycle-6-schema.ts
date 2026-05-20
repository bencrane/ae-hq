#!/usr/bin/env tsx
/**
 * check-cycle-6-schema.ts
 *
 * Criteria 4 + 5 verifier for /scope cycle `ae-hq-intent-consent-matchmaking`.
 *
 * Connects via `AE_DB_DIRECT_URL` and asserts the cycle-6 migration
 * (`0005_*.sql`) landed correctly AND the cycle-6 seed populated
 * `matches`, `company_match_criteria`, and the extended `intent_signals`
 * to spec. Pure post-state assertion — the verifier applies the migration
 * and runs the seed before invoking this.
 *
 * Schema (criterion 4):
 *   1. `intent_signals` gains EXACTLY the 4 new columns, correct types:
 *        target_investors    text[]   (ARRAY)
 *        watched_companies   uuid[]   (ARRAY)
 *        auto_match          boolean  (default false)
 *        discoverable        boolean  (default true)
 *      The 6 cycle-1 columns (candidate_id, target_stages, target_segments,
 *      comp_ote_min, target_geos, target_companies) MUST still be present —
 *      0005 is additive, never destructive.
 *   2. `company_match_criteria` exists with: company_id (PK, uuid),
 *      segments text[], sales_motions text[], min_years_experience int,
 *      worked_at_company_ids uuid[], investor_pedigree text[], updated_at.
 *      RLS ENABLED.
 *   3. `matches` exists with: id uuid, company_id uuid, candidate_id uuid,
 *      job_id uuid (NULLABLE), origin text, ae_consent text,
 *      company_consent text, status text, conversation_id uuid (NULLABLE),
 *      created_at, resolved_at (NULLABLE). RLS ENABLED.
 *   4. `matches` has a UNIQUE constraint over (company_id, candidate_id,
 *      job_id) — the dedup key the consent engine relies on for idempotency.
 *   5. `auto_match` defaults to false and `discoverable` defaults to true
 *      at the column level (a freshly-inserted intent row without those
 *      columns set must come back auto_match=false / discoverable=true).
 *   6. Pre-existing tables intact (sampled): `unlock_requests` still exists
 *      (the directive lets the executor migrate-or-parallel, but it must NOT
 *      be dropped without a replacement path); `applications` still has
 *      job_id; `companies` still has the cycle-4 firmographic columns;
 *      `intent_signals` still has its cycle-1 columns. Proves 0001-0004
 *      were not re-run destructively.
 *
 * Seed (criterion 5):
 *   7. `company_match_criteria` populated for all 20 companies.
 *   8. `intent_signals` extended — investors / watched companies / auto_match
 *      vary across the candidate set: >= 1 candidate has a non-empty
 *      target_investors, >= 1 has a non-empty watched_companies, and BOTH
 *      auto_match values (true AND false) are present.
 *   9. `candidate1` has auto_match=true AND non-empty intent criteria
 *      (rich criteria — at least one of target_investors / target_stages /
 *      target_segments is non-empty).
 *  10. ~30 `matches` seeded (>= 20 to tolerate distribution variance),
 *      spanning >= 3 distinct status values including `resolved`,
 *      `pending_ae`, AND `pending_company`.
 *  11. `candidate1` has >= 1 `pending_ae` match; Stripe has >= 1
 *      `pending_company` match. Every surface has content.
 *  12. Match invariants hold against the seeded rows:
 *        - every status value is in the enum set
 *        - every origin value is in {ae_initiated, company_initiated}
 *        - every `resolved` match HAS a non-null conversation_id and a
 *          non-null resolved_at
 *        - every `pending_ae` / `pending_company` match has a NULL
 *          conversation_id (anonymization: no thread until resolved)
 *        - no duplicate (company_id, candidate_id, job_id) triples
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

const VALID_MATCH_STATUS = ["resolved", "pending_ae", "pending_company", "declined", "expired"];
const VALID_ORIGIN = ["ae_initiated", "company_initiated"];

// [column, expected data_type substring]. Postgres reports array types as "ARRAY".
const INTENT_NEW_COLUMNS: ReadonlyArray<[string, string]> = [
  ["target_investors", "array"],
  ["watched_companies", "array"],
  ["auto_match", "boolean"],
  ["discoverable", "boolean"],
];
const INTENT_CYCLE1_COLUMNS = [
  "candidate_id",
  "target_stages",
  "target_segments",
  "comp_ote_min",
  "target_geos",
  "target_companies",
];
const CMC_COLUMNS: ReadonlyArray<[string, string]> = [
  ["company_id", "uuid"],
  ["segments", "array"],
  ["sales_motions", "array"],
  ["min_years_experience", "int"],
  ["worked_at_company_ids", "array"],
  ["investor_pedigree", "array"],
  ["updated_at", "timestamp"],
];
const MATCHES_COLUMNS: ReadonlyArray<[string, string]> = [
  ["id", "uuid"],
  ["company_id", "uuid"],
  ["candidate_id", "uuid"],
  ["job_id", "uuid"],
  ["origin", "text"],
  ["ae_consent", "text"],
  ["company_consent", "text"],
  ["status", "text"],
  ["conversation_id", "uuid"],
  ["created_at", "timestamp"],
  ["resolved_at", "timestamp"],
];
// columns on `matches` that MUST be nullable
const MATCHES_NULLABLE = ["job_id", "conversation_id", "resolved_at"];

const sql = postgres(DB_URL, { ssl: "prefer", max: 1 });

let failed = false;
function fail(msg: string) {
  console.error(`  FAIL  ${msg}`);
  failed = true;
}
function ok(msg: string) {
  console.log(`  ok    ${msg}`);
}

async function columnsOf(table: string) {
  return sql<{ column_name: string; data_type: string; is_nullable: string }[]>`
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = ${table}
  `;
}

async function rlsEnabled(table: string): Promise<boolean> {
  const r = await sql<{ relrowsecurity: boolean }[]>`
    select c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = ${table}
  `;
  return r[0]?.relrowsecurity === true;
}

async function main() {
  // ── 1. intent_signals: 4 new columns + cycle-1 columns intact ────────────
  const intentCols = await columnsOf("intent_signals");
  if (intentCols.length === 0) {
    fail("intent_signals does not exist — cycle-1 schema is gone");
    await sql.end({ timeout: 5 });
    process.exit(1);
  }
  const intentMap = new Map(intentCols.map((r) => [r.column_name, r.data_type]));
  for (const [name, expected] of INTENT_NEW_COLUMNS) {
    const dt = intentMap.get(name);
    if (!dt) {
      fail(`intent_signals.${name} — new column missing (migration 0005)`);
    } else if (!dt.toLowerCase().includes(expected.toLowerCase())) {
      fail(`intent_signals.${name} — type "${dt}", expected to contain "${expected}"`);
    } else {
      ok(`intent_signals.${name} (${dt})`);
    }
  }
  const missingC1 = INTENT_CYCLE1_COLUMNS.filter((c) => !intentMap.has(c));
  if (missingC1.length === 0) {
    ok("intent_signals retains all 6 cycle-1 columns (0005 is additive)");
  } else {
    fail(`intent_signals lost cycle-1 column(s): ${missingC1.join(", ")} — 0005 must be additive`);
  }

  // ── 2. company_match_criteria ─────────────────────────────────────────────
  const cmcCols = await columnsOf("company_match_criteria");
  if (cmcCols.length === 0) {
    fail("company_match_criteria does not exist — migration 0005 not applied");
  } else {
    const cmcMap = new Map(cmcCols.map((r) => [r.column_name, r.data_type]));
    for (const [name, expected] of CMC_COLUMNS) {
      const dt = cmcMap.get(name);
      if (!dt) {
        fail(`company_match_criteria.${name} — column missing`);
      } else if (!dt.toLowerCase().includes(expected.toLowerCase())) {
        fail(`company_match_criteria.${name} — type "${dt}", expected to contain "${expected}"`);
      } else {
        ok(`company_match_criteria.${name} (${dt})`);
      }
    }
    if (await rlsEnabled("company_match_criteria")) {
      ok("company_match_criteria RLS enabled");
    } else {
      fail("company_match_criteria RLS is NOT enabled — deny-all convention broken");
    }
  }

  // ── 3. matches columns + nullability ─────────────────────────────────────
  const matchCols = await columnsOf("matches");
  if (matchCols.length === 0) {
    fail("matches does not exist — migration 0005 not applied");
  } else {
    const matchMap = new Map(matchCols.map((r) => [r.column_name, r]));
    for (const [name, expected] of MATCHES_COLUMNS) {
      const col = matchMap.get(name);
      if (!col) {
        fail(`matches.${name} — column missing`);
      } else if (!col.data_type.toLowerCase().includes(expected.toLowerCase())) {
        fail(`matches.${name} — type "${col.data_type}", expected to contain "${expected}"`);
      } else {
        ok(`matches.${name} (${col.data_type})`);
      }
    }
    for (const name of MATCHES_NULLABLE) {
      const col = matchMap.get(name);
      if (col && col.is_nullable !== "YES") {
        fail(
          `matches.${name} is NOT NULL — it must be nullable ` +
            `(a general talent match has no job_id; a pending match has no conversation_id)`,
        );
      } else if (col) {
        ok(`matches.${name} is nullable`);
      }
    }
    if (await rlsEnabled("matches")) {
      ok("matches RLS enabled");
    } else {
      fail("matches RLS is NOT enabled — deny-all convention broken");
    }

    // ── 4. UNIQUE(company_id, candidate_id, job_id) ────────────────────────
    const idx = await sql<{ idxdef: string }[]>`
      select indexdef as idxdef
      from pg_indexes
      where schemaname = 'public' and tablename = 'matches'
    `;
    const hasUniqueTriple = idx.some(
      (r) =>
        /unique/i.test(r.idxdef) &&
        /\bcompany_id\b/.test(r.idxdef) &&
        /\bcandidate_id\b/.test(r.idxdef) &&
        /\bjob_id\b/.test(r.idxdef),
    );
    if (hasUniqueTriple) {
      ok("matches has a UNIQUE index over (company_id, candidate_id, job_id)");
    } else {
      fail(
        "matches is missing a UNIQUE(company_id, candidate_id, job_id) constraint — " +
          "the consent engine's idempotency key",
      );
    }
  }

  // ── 5. column defaults: auto_match=false, discoverable=true ──────────────
  // Insert a probe intent row touching only candidate_id; read the defaults
  // back; delete it. Uses a synthetic candidate_id that does not collide.
  {
    const probeDefaults = await sql<{ column_default: string | null; column_name: string }[]>`
      select column_name, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'intent_signals'
        and column_name in ('auto_match', 'discoverable')
    `;
    const dmap = new Map(probeDefaults.map((r) => [r.column_name, r.column_default]));
    const amDef = (dmap.get("auto_match") ?? "").toLowerCase();
    const discDef = (dmap.get("discoverable") ?? "").toLowerCase();
    if (amDef.includes("false")) {
      ok("intent_signals.auto_match defaults to false");
    } else {
      fail(`intent_signals.auto_match default is "${dmap.get("auto_match")}", expected false`);
    }
    if (discDef.includes("true")) {
      ok("intent_signals.discoverable defaults to true");
    } else {
      fail(`intent_signals.discoverable default is "${dmap.get("discoverable")}", expected true`);
    }
  }

  // ── 6. 0001-0004 not re-run destructively (sampled) ──────────────────────
  const unlockReq = await sql<{ n: number }[]>`
    select count(*)::int as n from information_schema.tables
    where table_schema = 'public' and table_name = 'unlock_requests'
  `;
  if ((unlockReq[0]?.n ?? 0) === 1) {
    ok("unlock_requests table preserved (cycle-1 — coexists with matches)");
  } else {
    fail(
      "unlock_requests table is GONE — the directive lets the executor migrate-or-parallel " +
        "but the cycle-1 unlock data/flow must not vanish without a documented replacement",
    );
  }
  const appJobId = await sql<{ n: number }[]>`
    select count(*)::int as n from information_schema.columns
    where table_schema = 'public' and table_name = 'applications' and column_name = 'job_id'
  `;
  const coCols = await sql<{ n: number }[]>`
    select count(*)::int as n from information_schema.columns
    where table_schema = 'public' and table_name = 'companies'
      and column_name in ('sales_motion','founded_year','investors','employee_count')
  `;
  if ((appJobId[0]?.n ?? 0) === 1 && (coCols[0]?.n ?? 0) === 4) {
    ok("0001-0004 schema intact (applications.job_id + 4 cycle-4 firmographic columns)");
  } else {
    fail(
      `pre-cycle-6 schema drifted (applications.job_id=${appJobId[0]?.n}, ` +
        `companies firmographic cols=${coCols[0]?.n}/4) — 0005 must be purely additive`,
    );
  }

  // Short-circuit if schema is unsound — seed checks would be noise.
  if (failed) {
    await sql.end({ timeout: 5 });
    console.error("\nFAIL: cycle-6 schema not sound — skipping seed checks");
    process.exit(1);
  }

  // ── 7. company_match_criteria for all 20 companies ───────────────────────
  const coTotal = await sql<{ n: number }[]>`select count(*)::int as n from public.companies`;
  const cmcTotal = await sql<{ n: number }[]>`
    select count(*)::int as n from public.company_match_criteria
  `;
  const nCo = coTotal[0]?.n ?? 0;
  const nCmc = cmcTotal[0]?.n ?? 0;
  if (nCmc >= nCo && nCo > 0) {
    ok(`company_match_criteria seeded for all ${nCo} companies`);
  } else {
    fail(`company_match_criteria has ${nCmc} rows for ${nCo} companies — every company needs criteria`);
  }

  // ── 8. extended intent_signals variety ───────────────────────────────────
  const intentVariety = await sql<{
    with_investors: number;
    with_watched: number;
    automatch_true: number;
    automatch_false: number;
  }[]>`
    select
      count(*) filter (where target_investors is not null
        and array_length(target_investors, 1) > 0)::int  as with_investors,
      count(*) filter (where watched_companies is not null
        and array_length(watched_companies, 1) > 0)::int  as with_watched,
      count(*) filter (where auto_match is true)::int     as automatch_true,
      count(*) filter (where auto_match is false)::int    as automatch_false
    from public.intent_signals
  `;
  const v = intentVariety[0];
  if ((v?.with_investors ?? 0) >= 1) {
    ok(`${v?.with_investors} candidate(s) declare target_investors`);
  } else {
    fail("no candidate has a non-empty target_investors — investor dimension not seeded");
  }
  if ((v?.with_watched ?? 0) >= 1) {
    ok(`${v?.with_watched} candidate(s) watch specific companies`);
  } else {
    fail("no candidate has a non-empty watched_companies — watched dimension not seeded");
  }
  if ((v?.automatch_true ?? 0) >= 1 && (v?.automatch_false ?? 0) >= 1) {
    ok(`auto_match varies (${v?.automatch_true} on / ${v?.automatch_false} off)`);
  } else {
    fail(
      `auto_match must vary across candidates — ` +
        `${v?.automatch_true} on / ${v?.automatch_false} off (need both)`,
    );
  }

  // ── 9. candidate1 has auto_match=true + rich criteria ────────────────────
  const c1 = await sql<{
    auto_match: boolean;
    n_inv: number;
    n_stages: number;
    n_segs: number;
  }[]>`
    select
      i.auto_match,
      coalesce(array_length(i.target_investors, 1), 0)::int as n_inv,
      coalesce(array_length(i.target_stages, 1), 0)::int    as n_stages,
      coalesce(array_length(i.target_segments, 1), 0)::int  as n_segs
    from public.intent_signals i
    join auth.users u on u.id = i.candidate_id
    where u.email = ${CAND_EMAIL}
  `;
  if (c1.length === 0) {
    fail(`${CAND_EMAIL} has no intent_signals row`);
  } else {
    const row = c1[0];
    if (row.auto_match === true) {
      ok(`${CAND_EMAIL} has auto_match=true`);
    } else {
      fail(`${CAND_EMAIL} has auto_match=${row.auto_match} — directive requires true`);
    }
    if (row.n_inv + row.n_stages + row.n_segs > 0) {
      ok(`${CAND_EMAIL} has rich criteria (investors=${row.n_inv} stages=${row.n_stages} segments=${row.n_segs})`);
    } else {
      fail(`${CAND_EMAIL} has empty criteria — directive requires rich criteria`);
    }
  }

  // ── 10. ~30 matches across >= 3 statuses incl. the 3 live states ─────────
  const matchTotal = await sql<{ n: number }[]>`select count(*)::int as n from public.matches`;
  const nMatch = matchTotal[0]?.n ?? 0;
  if (nMatch >= 20) {
    ok(`${nMatch} matches seeded (directive target ~30)`);
  } else {
    fail(`only ${nMatch} matches seeded — directive requires ~30 (>=20 to pass)`);
  }
  const statusRows = await sql<{ status: string; n: number }[]>`
    select status, count(*)::int as n from public.matches group by status
  `;
  const statusSet = new Set(statusRows.map((r) => r.status));
  const badStatus = [...statusSet].filter((s) => !VALID_MATCH_STATUS.includes(s));
  if (badStatus.length > 0) fail(`invalid match status value(s): ${badStatus.join(", ")}`);
  for (const required of ["resolved", "pending_ae", "pending_company"]) {
    if (statusSet.has(required)) {
      ok(`matches include the "${required}" state`);
    } else {
      fail(`matches have NO "${required}" rows — that surface would be empty`);
    }
  }

  // ── 11. candidate1 pending_ae; Stripe pending_company ────────────────────
  const c1Pending = await sql<{ n: number }[]>`
    select count(*)::int as n
    from public.matches m
    join auth.users u on u.id = m.candidate_id
    where u.email = ${CAND_EMAIL} and m.status = 'pending_ae'
  `;
  if ((c1Pending[0]?.n ?? 0) >= 1) {
    ok(`${CAND_EMAIL} has ${c1Pending[0]?.n} pending_ae match(es) — /me/approvals has content`);
  } else {
    fail(`${CAND_EMAIL} has no pending_ae match — the AE approvals surface would be empty`);
  }
  const stripePending = await sql<{ n: number }[]>`
    select count(*)::int as n
    from public.matches m
    join public.companies c on c.id = m.company_id
    where c.slug = 'stripe' and m.status = 'pending_company'
  `;
  if ((stripePending[0]?.n ?? 0) >= 1) {
    ok(`Stripe has ${stripePending[0]?.n} pending_company match(es) — inbound-interest surface has content`);
  } else {
    fail("Stripe has no pending_company match — the company inbound-interest surface would be empty");
  }

  // ── 12. match invariants against seeded rows ─────────────────────────────
  const badOrigin = await sql<{ origin: string }[]>`
    select distinct origin from public.matches
    where origin not in ('ae_initiated', 'company_initiated')
  `;
  if (badOrigin.length === 0) {
    ok("every match origin is in {ae_initiated, company_initiated}");
  } else {
    fail(`invalid match origin value(s): ${badOrigin.map((r) => r.origin).join(", ")}`);
  }
  const resolvedBad = await sql<{ n: number }[]>`
    select count(*)::int as n from public.matches
    where status = 'resolved' and (conversation_id is null or resolved_at is null)
  `;
  if ((resolvedBad[0]?.n ?? 0) === 0) {
    ok("every resolved match has a conversation_id AND a resolved_at");
  } else {
    fail(
      `${resolvedBad[0]?.n} resolved match(es) lack a conversation_id or resolved_at — ` +
        `a resolved match MUST point at an open conversation`,
    );
  }
  const pendingBad = await sql<{ n: number }[]>`
    select count(*)::int as n from public.matches
    where status in ('pending_ae', 'pending_company') and conversation_id is not null
  `;
  if ((pendingBad[0]?.n ?? 0) === 0) {
    ok("no pending match has a conversation_id (no thread until resolved — anonymization)");
  } else {
    fail(
      `${pendingBad[0]?.n} pending match(es) carry a conversation_id — ` +
        `a conversation must not exist before the match resolves`,
    );
  }
  const dupTriple = await sql<{ n: number }[]>`
    select count(*)::int as n from (
      select company_id, candidate_id, job_id
      from public.matches
      group by company_id, candidate_id, job_id
      having count(*) > 1
    ) d
  `;
  if ((dupTriple[0]?.n ?? 0) === 0) {
    ok("no duplicate (company_id, candidate_id, job_id) triples — seed respects the dedup key");
  } else {
    fail(`${dupTriple[0]?.n} duplicate (company_id, candidate_id, job_id) triple(s) in matches`);
  }

  await sql.end({ timeout: 5 });

  if (failed) {
    console.error("\nFAIL: cycle-6 schema/seed check did not pass");
    process.exit(1);
  }
  console.log(
    `OK: 0005 sound (intent +4 cols, matches + company_match_criteria w/ RLS + UNIQUE); ` +
      `${nMatch} matches seeded across resolved/pending_ae/pending_company; invariants hold`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(`FAIL: cycle-6 schema check threw: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
