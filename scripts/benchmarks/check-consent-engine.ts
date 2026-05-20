#!/usr/bin/env tsx
/**
 * check-consent-engine.ts
 *
 * Criteria 12 + 13 + 14 verifier for /scope cycle
 * `ae-hq-intent-consent-matchmaking` — the load-bearing consent state machine.
 *
 * Walks all three resolution paths end-to-end against the live BFF, asserting
 * BOTH the API contract and the DB side effects. Every path uses a freshly
 * MINTED fixture (its own throwaway company + candidate + intent + criteria),
 * so the check is hermetic and re-run safe — it never depends on seed data
 * and cleans up everything it created.
 *
 * The directive's consent model (implemented exactly):
 *   AE-initiated  : AE consent = explicit; company consent = standing iff the
 *                   AE satisfies the company's match-criteria. Both → resolve.
 *   Company-init  : company consent = explicit; AE consent = standing iff the
 *                   AE has auto_match=true AND satisfies their OWN criteria.
 *                   Pending AE → exactly one accept/decline prompt.
 *
 * ── PATH 12 — AE-initiated auto-resolve ──────────────────────────────────
 *   Fixture: company C12 with permissive match-criteria; candidate A12 that
 *   SATISFIES those criteria.
 *   Action : A12 POST /api/v1/candidates/me/express-interest toward C12.
 *   Assert : a `matches` row exists with status='resolved',
 *            origin='ae_initiated', conversation_id NOT NULL; a `conversations`
 *            row exists with that id; resolved_at set. NO pending state.
 *   Idempotency: a SECOND express-interest does not create a second match
 *            (UNIQUE(company,candidate,job)) and does not create a second
 *            conversation — match resolution is idempotent.
 *
 * ── PATH 13 — company-initiated, AE auto_match OFF ───────────────────────
 *   Fixture: company C13; candidate A13 with auto_match=FALSE (criteria fit
 *            is irrelevant — auto_match gates the standing consent).
 *   Action : C13's recruiter POST /company/candidates/:A13/express-interest.
 *   Assert : a `matches` row with status='pending_ae', conversation_id NULL.
 *            A13's GET /candidates/me/approvals surfaces this match as a
 *            pending prompt.
 *   Action : A13 POST /api/v1/matches/:id/accept.
 *   Assert : the match flips to status='resolved', conversation_id NOT NULL;
 *            a `conversations` row now exists. The single surviving manual
 *            approval, on the AE side.
 *
 * ── PATH 14 — company-initiated, AE auto_match ON + criteria fit ─────────
 *   Fixture: company C14; candidate A14 with auto_match=TRUE and declared
 *            criteria that C14 SATISFIES.
 *   Action : C14's recruiter POST /company/candidates/:A14/express-interest.
 *   Assert : the `matches` row is status='resolved' IMMEDIATELY,
 *            conversation_id NOT NULL — NO pending_ae was ever written, NO
 *            accept prompt. (Asserted: the match is never observed in
 *            pending_ae, and A14's approvals never surface it.)
 *
 * Strategy notes:
 *   - "Satisfying criteria" — the directive's predicate is segment / motion /
 *     years / worked-at / investor intersection. To make the fixture robust
 *     regardless of which subset the executor wires first, C12 and C14 are
 *     given DELIBERATELY PERMISSIVE criteria (empty arrays + min_years=0),
 *     which any candidate satisfies; the candidate's OWN criteria for A14 are
 *     likewise permissive toward C14. The check is about consent RESOLUTION,
 *     not about predicate edge cases (those are covered by check-discoverability
 *     and by the unit tests). If the executor's predicate treats an empty
 *     criteria array as "no constraint" (the only sane reading — a company
 *     that set no segments is open to all segments), these paths resolve.
 *   - Tokens are minted via the Supabase password grant, same as the cycle-5
 *     checks. Fixture users are created through the auth admin API so they can
 *     authenticate; they are deleted on cleanup.
 *
 * Required env:
 *   API_URL, AE_SUPABASE_URL|VITE_SUPABASE_URL,
 *   AE_SUPABASE_ANON_KEY|VITE_SUPABASE_PUBLISHABLE_KEY,
 *   AE_SUPABASE_SERVICE_ROLE_KEY (to mint fixture auth users),
 *   AE_DB_DIRECT_URL
 *
 * Exit codes:
 *   0 — all three consent paths resolve exactly per the model
 *   1 — a path produced the wrong state / side effect
 *   2 — could not authenticate / set up a fixture / request errored
 */

import postgres from "postgres";

const API_URL = process.env.API_URL ?? "http://localhost:8080";
const SUPABASE_URL = process.env.AE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.AE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY =
  process.env.AE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.AE_DB_DIRECT_URL;
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "testing123!";

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !DB_URL) {
  console.error(
    "FAIL: need AE_SUPABASE_URL, AE_SUPABASE_ANON_KEY, AE_SUPABASE_SERVICE_ROLE_KEY, " +
      "AE_DB_DIRECT_URL (source .env.local)",
  );
  process.exit(2);
}

const sql = postgres(DB_URL, { ssl: "prefer", max: 2 });
const RUN = Date.now().toString(36);

let failed = false;
function fail(msg: string) {
  console.error(`  FAIL  ${msg}`);
  failed = true;
}
function ok(msg: string) {
  console.log(`  ok    ${msg}`);
}

/** track every artifact we create so cleanup can remove it all. */
const created = {
  userIds: [] as string[],
  companyIds: [] as string[],
};

async function adminCreateUser(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY as string,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ email, password: TEST_PASSWORD, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`admin create user ${email} -> ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error(`admin create user ${email} returned no id`);
  created.userIds.push(json.id);
  return json.id;
}

async function mintToken(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY as string },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  if (!res.ok) throw new Error(`auth ${email} -> ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error(`auth ${email} returned no access_token`);
  return json.access_token;
}

type ApiResult = { status: number; body: unknown; text: string };
async function api(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<ApiResult> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed, text };
}

/**
 * Build a fixture company with a profiles row + company row + a recruiter
 * member + a permissive (or supplied) company_match_criteria + at least one
 * pipeline stage (resolution may place the candidate in a pipeline).
 */
async function makeCompany(
  tag: string,
  criteria: {
    segments: string[];
    sales_motions: string[];
    min_years_experience: number;
    worked_at_company_ids: string[];
    investor_pedigree: string[];
  },
): Promise<{ companyId: string; recruiterEmail: string }> {
  const slug = `c6-${tag}-${RUN}`;
  const recruiterEmail = `c6-rec-${tag}-${RUN}@consent.test`;
  const recruiterId = await adminCreateUser(recruiterEmail);

  const coRows = await sql<{ id: string }[]>`
    insert into public.companies (slug, name)
    values (${slug}, ${`Consent Fixture ${tag}`})
    returning id::text
  `;
  const companyId = coRows[0].id;
  created.companyIds.push(companyId);

  // recruiter needs a profile row + company membership to pass loadCompanyId.
  // profiles PK is user_id; kind ∈ {candidate, company_member}; email NOT NULL.
  await sql`
    insert into public.profiles (user_id, kind, email, name)
    values (${recruiterId}, 'company_member', ${recruiterEmail}, ${`Recruiter ${tag}`})
    on conflict (user_id) do nothing
  `;
  await sql`
    insert into public.company_members (company_id, user_id, role)
    values (${companyId}, ${recruiterId}, 'admin')
  `;
  // one pipeline stage so a resolution that places a pipeline row can land.
  // color + is_terminal are NOT NULL with no default — supply them.
  await sql`
    insert into public.pipeline_stages (company_id, name, position, color, is_terminal)
    values (${companyId}, 'Sourced', 0, '#888888', false)
  `;
  // the company's standing consent.
  await sql`
    insert into public.company_match_criteria
      (company_id, segments, sales_motions, min_years_experience,
       worked_at_company_ids, investor_pedigree)
    values (
      ${companyId},
      ${criteria.segments},
      ${criteria.sales_motions},
      ${criteria.min_years_experience},
      ${criteria.worked_at_company_ids},
      ${criteria.investor_pedigree}
    )
  `;
  return { companyId, recruiterEmail };
}

/**
 * Build a fixture candidate: auth user + profile + candidates row + an
 * intent_signals row with the supplied auto_match + criteria.
 */
async function makeCandidate(
  tag: string,
  opts: {
    autoMatch: boolean;
    segmentFocus: string;
    targetStages: string[];
    targetSegments: string[];
    targetInvestors: string[];
  },
): Promise<{ candidateId: string; email: string }> {
  const email = `c6-ae-${tag}-${RUN}@consent.test`;
  const candidateId = await adminCreateUser(email);
  await sql`
    insert into public.profiles (user_id, kind, email, name)
    values (${candidateId}, 'candidate', ${email}, ${`AE ${tag}`})
    on conflict (user_id) do nothing
  `;
  await sql`
    insert into public.candidates (user_id, headline, segment_focus)
    values (${candidateId}, ${`AE ${tag} headline`}, ${opts.segmentFocus})
    on conflict (user_id) do nothing
  `;
  // target_geos + target_companies are NOT NULL on the cycle-1 table — supply
  // them as empty arrays; auto_match / discoverable are 0005 additions.
  await sql`
    insert into public.intent_signals
      (candidate_id, target_stages, target_segments, target_geos,
       target_companies, target_investors, auto_match, discoverable)
    values (
      ${candidateId},
      ${opts.targetStages},
      ${opts.targetSegments},
      ${[]},
      ${[]},
      ${opts.targetInvestors},
      ${opts.autoMatch},
      true
    )
    on conflict (candidate_id) do update set
      target_stages    = excluded.target_stages,
      target_segments  = excluded.target_segments,
      target_investors = excluded.target_investors,
      auto_match       = excluded.auto_match,
      discoverable     = excluded.discoverable
  `;
  return { candidateId, email };
}

async function matchRow(companyId: string, candidateId: string) {
  const rows = await sql<
    {
      id: string;
      status: string;
      origin: string;
      ae_consent: string;
      company_consent: string;
      conversation_id: string | null;
      resolved_at: string | null;
    }[]
  >`
    select id::text, status, origin, ae_consent, company_consent,
           conversation_id::text, resolved_at
    from public.matches
    where company_id = ${companyId} and candidate_id = ${candidateId}
  `;
  return rows;
}

async function conversationCount(companyId: string, candidateId: string): Promise<number> {
  const r = await sql<{ n: number }[]>`
    select count(*)::int as n from public.conversations
    where company_id = ${companyId} and candidate_id = ${candidateId}
  `;
  return r[0]?.n ?? 0;
}

// ── PATH 12 ─────────────────────────────────────────────────────────────────
async function path12() {
  console.log("\n── Path 12 — AE-initiated auto-resolve (AE satisfies company criteria)");
  const permissive = {
    segments: [] as string[],
    sales_motions: [] as string[],
    min_years_experience: 0,
    worked_at_company_ids: [] as string[],
    investor_pedigree: [] as string[],
  };
  const { companyId } = await makeCompany("p12", permissive);
  const { candidateId, email } = await makeCandidate("p12", {
    autoMatch: false,
    segmentFocus: "Enterprise",
    targetStages: [],
    targetSegments: [],
    targetInvestors: [],
  });
  const token = await mintToken(email);

  // AE expresses interest toward the company. The directive's endpoint is
  // POST /api/v1/candidates/me/express-interest with a company target. The
  // exact body shape is the executor's (zod) — we send the documented intent
  // and accept any 2xx; the DB assertion is the real arbiter.
  const res = await api("POST", "/api/v1/candidates/me/express-interest", token, {
    company_id: companyId,
  });
  if (res.status < 200 || res.status >= 300) {
    fail(`AE express-interest -> ${res.status}: ${res.text.slice(0, 240)}`);
    return;
  }
  ok(`AE express-interest accepted (${res.status})`);

  const rows = await matchRow(companyId, candidateId);
  if (rows.length !== 1) {
    fail(`expected exactly 1 match row, found ${rows.length}`);
    return;
  }
  const m = rows[0];
  if (m.status === "resolved") {
    ok("match.status = resolved (both sides consented — no approval step)");
  } else {
    fail(`match.status = "${m.status}", expected "resolved" (AE satisfies permissive criteria)`);
  }
  if (m.origin === "ae_initiated") {
    ok("match.origin = ae_initiated");
  } else {
    fail(`match.origin = "${m.origin}", expected "ae_initiated"`);
  }
  if (m.conversation_id) {
    ok(`match.conversation_id set (${m.conversation_id.slice(0, 8)}…)`);
  } else {
    fail("match.conversation_id is NULL — a resolved match must point at a conversation");
  }
  if (m.resolved_at) {
    ok("match.resolved_at set");
  } else {
    fail("match.resolved_at is NULL on a resolved match");
  }
  if (m.conversation_id) {
    const convRows = await sql<{ n: number }[]>`
      select count(*)::int as n from public.conversations where id = ${m.conversation_id}
    `;
    if ((convRows[0]?.n ?? 0) === 1) {
      ok("a conversations row exists for the resolved match");
    } else {
      fail("match.conversation_id points at a non-existent conversations row");
    }
  }

  // ── idempotency — a second express-interest must not duplicate ──────────
  const res2 = await api("POST", "/api/v1/candidates/me/express-interest", token, {
    company_id: companyId,
  });
  if (res2.status >= 200 && res2.status < 500) {
    ok(`re-express-interest returned ${res2.status} (no server error)`);
  } else {
    fail(`re-express-interest returned ${res2.status} — expected an idempotent 2xx/4xx`);
  }
  const rows2 = await matchRow(companyId, candidateId);
  if (rows2.length === 1) {
    ok("re-express-interest did NOT create a second match (idempotent)");
  } else {
    fail(`re-express-interest produced ${rows2.length} match rows — consent engine not idempotent`);
  }
  const convN = await conversationCount(companyId, candidateId);
  if (convN === 1) {
    ok("exactly one conversation after re-express-interest (idempotent resolution)");
  } else {
    fail(`${convN} conversations after re-express-interest — resolution not idempotent`);
  }
}

// ── PATH 13 ─────────────────────────────────────────────────────────────────
async function path13() {
  console.log(
    "\n── Path 13 — company-initiated, AE auto_match OFF → pending_ae → accept → resolved",
  );
  const permissive = {
    segments: [] as string[],
    sales_motions: [] as string[],
    min_years_experience: 0,
    worked_at_company_ids: [] as string[],
    investor_pedigree: [] as string[],
  };
  const { companyId, recruiterEmail } = await makeCompany("p13", permissive);
  const { candidateId, email } = await makeCandidate("p13", {
    autoMatch: false, // ← the gate: standing AE consent is OFF
    segmentFocus: "Enterprise",
    targetStages: [],
    targetSegments: [],
    targetInvestors: [],
  });
  const recToken = await mintToken(recruiterEmail);
  const aeToken = await mintToken(email);

  // company expresses interest in the AE.
  const res = await api(
    "POST",
    `/api/v1/company/candidates/${candidateId}/express-interest`,
    recToken,
    {},
  );
  if (res.status < 200 || res.status >= 300) {
    fail(`company express-interest -> ${res.status}: ${res.text.slice(0, 240)}`);
    return;
  }
  ok(`company express-interest accepted (${res.status})`);

  let rows = await matchRow(companyId, candidateId);
  if (rows.length !== 1) {
    fail(`expected exactly 1 match row, found ${rows.length}`);
    return;
  }
  let m = rows[0];
  if (m.status === "pending_ae") {
    ok("match.status = pending_ae (AE auto_match off — needs explicit accept)");
  } else {
    fail(`match.status = "${m.status}", expected "pending_ae" (auto_match is off)`);
  }
  if (m.conversation_id === null) {
    ok("no conversation yet (match not resolved)");
  } else {
    fail("match.conversation_id is set on a pending_ae match — no thread before resolve");
  }
  if (m.origin === "company_initiated") {
    ok("match.origin = company_initiated");
  } else {
    fail(`match.origin = "${m.origin}", expected "company_initiated"`);
  }

  // the AE's approvals surface must show this pending match as a prompt.
  const approvals = await api("GET", "/api/v1/candidates/me/approvals", aeToken);
  if (approvals.status === 200) {
    const txt = JSON.stringify(approvals.body ?? {});
    if (txt.includes(m.id)) {
      ok("AE /me/approvals surfaces the pending_ae match as a prompt");
    } else {
      fail(`AE /me/approvals does not include match ${m.id} — the accept prompt is missing`);
    }
  } else {
    fail(`GET /me/approvals -> ${approvals.status}: ${approvals.text.slice(0, 200)}`);
  }

  // AE accepts the match — the single surviving manual approval.
  const accept = await api("POST", `/api/v1/matches/${m.id}/accept`, aeToken, {});
  if (accept.status < 200 || accept.status >= 300) {
    fail(`POST /matches/:id/accept -> ${accept.status}: ${accept.text.slice(0, 240)}`);
    return;
  }
  ok(`AE accept accepted (${accept.status})`);

  rows = await matchRow(companyId, candidateId);
  m = rows[0];
  if (m.status === "resolved") {
    ok("match.status = resolved after AE accept");
  } else {
    fail(`match.status = "${m.status}" after accept, expected "resolved"`);
  }
  if (m.conversation_id) {
    ok("match.conversation_id set after accept");
    const convRows = await sql<{ n: number }[]>`
      select count(*)::int as n from public.conversations where id = ${m.conversation_id}
    `;
    if ((convRows[0]?.n ?? 0) === 1) {
      ok("a conversations row exists after the AE accept");
    } else {
      fail("post-accept match.conversation_id points at no conversations row");
    }
  } else {
    fail("match.conversation_id still NULL after accept — accept must open the conversation");
  }
}

// ── PATH 14 ─────────────────────────────────────────────────────────────────
async function path14() {
  console.log(
    "\n── Path 14 — company-initiated, AE auto_match ON + criteria fit → immediate resolve",
  );
  const permissive = {
    segments: [] as string[],
    sales_motions: [] as string[],
    min_years_experience: 0,
    worked_at_company_ids: [] as string[],
    investor_pedigree: [] as string[],
  };
  const { companyId, recruiterEmail } = await makeCompany("p14", permissive);
  // auto_match ON, and the AE's OWN criteria are permissive (empty) so the
  // company satisfies them — the standing-consent precondition is met.
  const { candidateId, email } = await makeCandidate("p14", {
    autoMatch: true,
    segmentFocus: "Enterprise",
    targetStages: [],
    targetSegments: [],
    targetInvestors: [],
  });
  const recToken = await mintToken(recruiterEmail);
  const aeToken = await mintToken(email);

  const res = await api(
    "POST",
    `/api/v1/company/candidates/${candidateId}/express-interest`,
    recToken,
    {},
  );
  if (res.status < 200 || res.status >= 300) {
    fail(`company express-interest -> ${res.status}: ${res.text.slice(0, 240)}`);
    return;
  }
  ok(`company express-interest accepted (${res.status})`);

  const rows = await matchRow(companyId, candidateId);
  if (rows.length !== 1) {
    fail(`expected exactly 1 match row, found ${rows.length}`);
    return;
  }
  const m = rows[0];
  if (m.status === "resolved") {
    ok("match.status = resolved IMMEDIATELY (auto_match on + criteria fit — no prompt)");
  } else {
    fail(
      `match.status = "${m.status}", expected "resolved" — auto_match is on and the AE's ` +
        `criteria are permissive, so standing AE consent should resolve this with no prompt`,
    );
  }
  if (m.conversation_id) {
    ok("match.conversation_id set on the immediate resolve");
  } else {
    fail("match.conversation_id is NULL — an immediate resolve must open a conversation");
  }
  // the AE's approvals surface must NOT show this — there was never a prompt.
  const approvals = await api("GET", "/api/v1/candidates/me/approvals", aeToken);
  if (approvals.status === 200) {
    const txt = JSON.stringify(approvals.body ?? {});
    if (!txt.includes(m.id)) {
      ok("AE /me/approvals does NOT surface this match — no manual approval was required");
    } else {
      fail(
        `AE /me/approvals includes match ${m.id} — an auto_match-on resolve must NOT ` +
          `produce an approval prompt`,
      );
    }
  } else {
    fail(`GET /me/approvals -> ${approvals.status}`);
  }
}

// ── cleanup ──────────────────────────────────────────────────────────────────
async function cleanup() {
  // child rows first (FK order): pipeline_activity → pipeline_candidates →
  // matches → conversations → messages, intent → criteria → members →
  // candidates → stages → companies; profiles + auth users last.
  for (const companyId of created.companyIds) {
    await sql`delete from public.pipeline_activity where pipeline_candidate_id in (
                select id from public.pipeline_candidates where company_id = ${companyId})`.catch(
      () => {},
    );
    await sql`delete from public.pipeline_candidates where company_id = ${companyId}`.catch(
      () => {},
    );
    await sql`delete from public.matches where company_id = ${companyId}`.catch(() => {});
    await sql`delete from public.messages where conversation_id in (
                select id from public.conversations where company_id = ${companyId})`.catch(
      () => {},
    );
    await sql`delete from public.conversations where company_id = ${companyId}`.catch(() => {});
    await sql`delete from public.notifications where user_id in (
                select user_id from public.company_members where company_id = ${companyId})`.catch(
      () => {},
    );
    await sql`delete from public.company_match_criteria where company_id = ${companyId}`.catch(
      () => {},
    );
    await sql`delete from public.company_members where company_id = ${companyId}`.catch(() => {});
    await sql`delete from public.pipeline_stages where company_id = ${companyId}`.catch(() => {});
    await sql`delete from public.unlock_requests where company_id = ${companyId}`.catch(() => {});
    await sql`delete from public.companies where id = ${companyId}`.catch(() => {});
  }
  for (const userId of created.userIds) {
    await sql`delete from public.intent_signals where candidate_id = ${userId}`.catch(() => {});
    await sql`delete from public.notifications where user_id = ${userId}`.catch(() => {});
    await sql`delete from public.candidates where user_id = ${userId}`.catch(() => {});
    await sql`delete from public.profiles where id = ${userId}`.catch(() => {});
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY as string, Authorization: `Bearer ${SERVICE_KEY}` },
    }).catch(() => {});
  }
}

async function main() {
  try {
    await path12();
    await path13();
    await path14();
  } catch (e) {
    fail(`consent-engine check threw: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    try {
      await cleanup();
      console.log("\n  ok    fixtures cleaned up (check is re-run safe)");
    } catch (e) {
      console.error(`  warn  cleanup incomplete: ${e instanceof Error ? e.message : String(e)}`);
    }
    await sql.end({ timeout: 5 });
  }

  if (failed) {
    console.error("\nFAIL: the consent state machine did not resolve per the model");
    process.exit(1);
  }
  console.log(
    "\nOK: all three consent paths resolve exactly — AE-initiated auto-resolve, " +
      "company-initiated pending_ae→accept, company-initiated auto_match immediate resolve",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(`FAIL: consent-engine check fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
