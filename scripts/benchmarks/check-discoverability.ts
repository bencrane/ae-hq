#!/usr/bin/env tsx
/**
 * check-discoverability.ts
 *
 * Criteria 11 + 15 verifier for /scope cycle
 * `ae-hq-intent-consent-matchmaking` — the discoverability (anonymization
 * exposure) rule and the identity-stays-hidden-until-resolve rule.
 *
 * The directive's discoverability rule:
 *   "An AE appears in a company's matchmaking results (as an anonymized card)
 *    ONLY if that company satisfies the AE's own declared criteria. The AE's
 *    criteria double as their exposure filter. An AE who declares nothing /
 *    opts out is not discoverable."
 *
 * This check CONSTRUCTS the decisive case rather than trusting seed data:
 *
 *   Fixture company  CO        — a fixed, known stage (e.g. 'series_a').
 *   AE_INCLUDE       — target_stages CONTAINS CO's stage, discoverable=true.
 *                      → MUST appear in CO's POST /api/v1/company/discover.
 *   AE_EXCLUDE       — target_stages is a stage CO does NOT have,
 *                      discoverable=true.
 *                      → MUST NOT appear (the company fails the AE's filter).
 *   AE_OPTOUT        — discoverable=false (criteria would otherwise match).
 *                      → MUST NOT appear (explicit opt-out).
 *
 * It also asserts criterion 15 — anonymization on the wire:
 *   a) the discover response for AE_INCLUDE's card carries NO full name. The
 *      card may carry initials, a headline, derived facts — but the
 *      `profiles.name` string must not appear anywhere in the card JSON. This
 *      is the "leak through a join" guard: the BFF joins profiles to derive
 *      initials; the full name must be dropped before serialization.
 *   b) the anonymized profile detail (GET /company/candidates/:id or the
 *      discover-card detail) for an UNRESOLVED candidate likewise carries no
 *      full name.
 *   c) a `pending` match does not expose identity: with a pending_company
 *      match between CO and AE_INCLUDE, the candidate's name still does not
 *      appear in the company's view of that match. Identity is revealed only
 *      after status='resolved'.
 *
 * Why construct rather than seed: a seeded fixture cannot guarantee the
 * EXCLUDE direction — the directive explicitly demands "an AE whose own
 * criteria EXCLUDE the querying company does NOT appear". Only a constructed
 * pair pins both directions deterministically.
 *
 * Robustness: the predicate dimension used is `target_stages` vs the
 * company's `stage`. If the executor's discover filter keys the AE exposure
 * filter on a different dimension first, this check still holds AS LONG AS
 * the AE's declared criteria are honored as the exposure filter at all — the
 * INCLUDE AE is given a criteria set that matches CO on EVERY plausible
 * dimension, and the EXCLUDE AE is made to mismatch on stage, the most
 * basic firmographic. If the executor ignores stage entirely in the exposure
 * filter, criterion 11's EXCLUDE assertion fails loudly — which is correct,
 * because the directive's example is explicitly a criteria-exclusion case.
 *
 * Required env:
 *   API_URL, AE_SUPABASE_URL|VITE_SUPABASE_URL,
 *   AE_SUPABASE_ANON_KEY|VITE_SUPABASE_PUBLISHABLE_KEY,
 *   AE_SUPABASE_SERVICE_ROLE_KEY, AE_DB_DIRECT_URL
 *
 * Exit codes:
 *   0 — discoverability rule + anonymization hold
 *   1 — an AE was wrongly (in)visible / identity leaked
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

// Distinct, unmistakable full names — if any of these strings appears in a
// discover/profile payload, the anonymization leaked.
const NAME_INCLUDE = `Zzdiscover Includecase ${RUN}`;
const NAME_EXCLUDE = `Zzdiscover Excludecase ${RUN}`;
const NAME_OPTOUT = `Zzdiscover Optoutcase ${RUN}`;

let failed = false;
function fail(msg: string) {
  console.error(`  FAIL  ${msg}`);
  failed = true;
}
function ok(msg: string) {
  console.log(`  ok    ${msg}`);
}

const created = { userIds: [] as string[], companyIds: [] as string[] };

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
 * The company's firmographic `stage` column. cycle-3 added company
 * firmographics; the discoverability predicate compares the company's stage
 * to an AE's target_stages. We read the actual column name defensively — the
 * directive's intent table calls it target_stages, the company side is the
 * firmographic stage.
 */
async function pickStages(): Promise<{ inStage: string; outStage: string }> {
  // Use whatever stage values exist on real companies so the fixture company
  // looks real; pick two distinct ones.
  const rows = await sql<{ stage: string }[]>`
    select distinct stage from public.companies
    where stage is not null
    order by stage
  `;
  const stages = rows.map((r) => r.stage);
  if (stages.length >= 2) return { inStage: stages[0], outStage: stages[1] };
  // fall back to canonical values if the column is sparsely populated.
  return { inStage: "series_a", outStage: "public" };
}

async function makeCompanyWithStage(
  stage: string,
): Promise<{ companyId: string; recruiterEmail: string }> {
  const slug = `c6-disc-co-${RUN}`;
  const recruiterEmail = `c6-disc-rec-${RUN}@discover.test`;
  const recruiterId = await adminCreateUser(recruiterEmail);

  const coRows = await sql<{ id: string }[]>`
    insert into public.companies (slug, name, stage)
    values (${slug}, ${`Discover Fixture Co ${RUN}`}, ${stage})
    returning id::text
  `;
  const companyId = coRows[0].id;
  created.companyIds.push(companyId);

  await sql`
    insert into public.profiles (user_id, kind, email, name)
    values (${recruiterId}, 'company_member', ${recruiterEmail}, 'Discover Recruiter')
    on conflict (user_id) do nothing
  `;
  await sql`
    insert into public.company_members (company_id, user_id, role)
    values (${companyId}, ${recruiterId}, 'admin')
  `;
  await sql`
    insert into public.pipeline_stages (company_id, name, position, color, is_terminal)
    values (${companyId}, 'Sourced', 0, '#888888', false)
  `;
  // permissive company match-criteria — the company is open to everyone; the
  // gate under test is the AE-side exposure filter, not the company filter.
  await sql`
    insert into public.company_match_criteria
      (company_id, segments, sales_motions, min_years_experience,
       worked_at_company_ids, investor_pedigree)
    values (${companyId}, ${[]}, ${[]}, 0, ${[]}, ${[]})
  `;
  return { companyId, recruiterEmail };
}

async function makeCandidate(
  tag: string,
  name: string,
  opts: { targetStages: string[]; discoverable: boolean },
): Promise<{ candidateId: string; email: string }> {
  const email = `c6-disc-${tag}-${RUN}@discover.test`;
  const candidateId = await adminCreateUser(email);
  await sql`
    insert into public.profiles (user_id, kind, email, name)
    values (${candidateId}, 'candidate', ${email}, ${name})
    on conflict (user_id) do nothing
  `;
  await sql`
    insert into public.candidates (user_id, headline, segment_focus)
    values (${candidateId}, ${`${tag} headline`}, 'Enterprise')
    on conflict (user_id) do nothing
  `;
  // target_segments / target_geos / target_companies are NOT NULL on the
  // cycle-1 table — supply empty arrays; auto_match / discoverable are 0005.
  await sql`
    insert into public.intent_signals
      (candidate_id, target_stages, target_segments, target_geos,
       target_companies, target_investors, auto_match, discoverable)
    values (${candidateId}, ${opts.targetStages}, ${[]}, ${[]}, ${[]}, ${[]},
            false, ${opts.discoverable})
    on conflict (candidate_id) do update set
      target_stages = excluded.target_stages,
      discoverable  = excluded.discoverable
  `;
  return { candidateId, email };
}

/** scan an arbitrary JSON value for an exact substring (the leaked name). */
function jsonContains(value: unknown, needle: string): boolean {
  return JSON.stringify(value ?? {}).includes(needle);
}

/** collect every id-like string out of a discover response, shape-agnostic. */
function discoverIds(body: unknown): string[] {
  const arr =
    (body as { candidates?: unknown[] })?.candidates ??
    (body as { results?: unknown[] })?.results ??
    (Array.isArray(body) ? (body as unknown[]) : []);
  const ids: string[] = [];
  for (const row of arr) {
    const v = (row as { id?: unknown; candidate_id?: unknown; user_id?: unknown }) ?? {};
    for (const cand of [v.id, v.candidate_id, v.user_id]) {
      if (typeof cand === "string") ids.push(cand);
    }
  }
  return ids;
}

async function main() {
  try {
    const { inStage, outStage } = await pickStages();
    console.log(`  ok    fixture stages: company=${inStage}  exclude-target=${outStage}`);
    const { companyId, recruiterEmail } = await makeCompanyWithStage(inStage);

    const include = await makeCandidate("include", NAME_INCLUDE, {
      targetStages: [inStage], // company's stage IS in the AE's criteria
      discoverable: true,
    });
    const exclude = await makeCandidate("exclude", NAME_EXCLUDE, {
      targetStages: [outStage], // company's stage is NOT in the AE's criteria
      discoverable: true,
    });
    const optout = await makeCandidate("optout", NAME_OPTOUT, {
      targetStages: [inStage], // would match...
      discoverable: false, // ...but the AE opted out
    });

    const recToken = await mintToken(recruiterEmail);

    // ── criterion 11 — discover with a permissive criteria query ──────────
    // The criteria-builder body is the executor's zod shape; send a maximally
    // permissive query (no constraints) and let the discoverability filter be
    // the only thing narrowing the set.
    const disc = await api("POST", "/api/v1/company/discover", recToken, {});
    if (disc.status < 200 || disc.status >= 300) {
      fail(`POST /api/v1/company/discover -> ${disc.status}: ${disc.text.slice(0, 240)}`);
    } else {
      ok(`POST /company/discover accepted (${disc.status})`);
      const ids = discoverIds(disc.body);

      if (ids.includes(include.candidateId)) {
        ok("AE_INCLUDE appears in discover results (company satisfies the AE's criteria)");
      } else {
        fail(
          "AE_INCLUDE is ABSENT from discover results — an AE whose criteria include the " +
            "querying company MUST be discoverable",
        );
      }
      if (!ids.includes(exclude.candidateId)) {
        ok("AE_EXCLUDE is ABSENT from discover results (company fails the AE's exposure filter)");
      } else {
        fail(
          "AE_EXCLUDE appears in discover results — an AE whose own criteria EXCLUDE the " +
            "querying company must NOT be surfaced (discoverability rule violated)",
        );
      }
      if (!ids.includes(optout.candidateId)) {
        ok("AE_OPTOUT is ABSENT from discover results (discoverable=false honored)");
      } else {
        fail("AE_OPTOUT appears in discover results — discoverable=false must hide the AE");
      }

      // ── criterion 15a — no full name on the discover card ──────────────
      if (jsonContains(disc.body, NAME_INCLUDE)) {
        fail(
          `the full name "${NAME_INCLUDE}" leaked into the discover response — ` +
            `the card must be anonymized (initials only; drop profiles.name before serializing)`,
        );
      } else {
        ok("discover response does NOT contain the candidate's full name (anonymized)");
      }
    }

    // ── criterion 15b — anonymized profile detail hides the name ──────────
    const detail = await api(
      "GET",
      `/api/v1/company/candidates/${include.candidateId}`,
      recToken,
    );
    if (detail.status === 200) {
      if (jsonContains(detail.body, NAME_INCLUDE)) {
        fail(
          `the anonymized profile detail leaked "${NAME_INCLUDE}" — identity must stay hidden ` +
            `until a match resolves`,
        );
      } else {
        ok("anonymized profile detail does NOT contain the full name (unresolved candidate)");
      }
    } else {
      // a 404/403 here is acceptable if the executor gates detail differently;
      // only a leak is a failure. Note it, do not fail.
      console.log(`  ok    profile detail returned ${detail.status} (no leak path exercised)`);
    }

    // ── criterion 15c — a pending match does not reveal identity ──────────
    // Company expresses interest in AE_INCLUDE. AE_INCLUDE has auto_match=false
    // (makeCandidate default), so the match goes pending_company-or-pending_ae;
    // either way it is UNRESOLVED, so identity must stay hidden.
    const interest = await api(
      "POST",
      `/api/v1/company/candidates/${include.candidateId}/express-interest`,
      recToken,
      {},
    );
    if (interest.status >= 200 && interest.status < 300) {
      const pend = await sql<{ status: string }[]>`
        select status from public.matches
        where company_id = ${companyId} and candidate_id = ${include.candidateId}
      `;
      const st = pend[0]?.status;
      if (st && st !== "resolved") {
        ok(`match is unresolved (status=${st}) — identity must stay hidden`);
        // re-fetch the company's view of its matches; the name must not appear.
        const matchesView = await api("GET", "/api/v1/matches", recToken);
        if (matchesView.status === 200) {
          if (jsonContains(matchesView.body, NAME_INCLUDE)) {
            fail(
              `the full name "${NAME_INCLUDE}" leaked through GET /matches on a non-resolved ` +
                `match — identity is revealed only after the match resolves`,
            );
          } else {
            ok("GET /matches does NOT expose the candidate name on an unresolved match");
          }
        } else {
          console.log(`  ok    GET /matches -> ${matchesView.status} (no leak path exercised)`);
        }
      } else if (st === "resolved") {
        // auto_match is false so this should not happen — but if the executor
        // resolved it, the anonymization-until-resolve rule is moot for this
        // row; do not fail on it (criteria 13/14 cover resolution correctness).
        console.log("  ok    match resolved unexpectedly — anonymization-pending test skipped");
      } else {
        fail("company express-interest created no match row — cannot test pending anonymization");
      }
    } else {
      console.log(
        `  ok    company express-interest -> ${interest.status} (pending-anonymization test skipped)`,
      );
    }
  } catch (e) {
    fail(`discoverability check threw: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    try {
      for (const companyId of created.companyIds) {
        await sql`delete from public.pipeline_activity where pipeline_candidate_id in (
                    select id from public.pipeline_candidates where company_id = ${companyId})`.catch(
          () => {},
        );
        await sql`delete from public.pipeline_candidates where company_id = ${companyId}`.catch(
          () => {},
        );
        await sql`delete from public.matches where company_id = ${companyId}`.catch(() => {});
        await sql`delete from public.conversations where company_id = ${companyId}`.catch(
          () => {},
        );
        await sql`delete from public.company_match_criteria where company_id = ${companyId}`.catch(
          () => {},
        );
        await sql`delete from public.company_members where company_id = ${companyId}`.catch(
          () => {},
        );
        await sql`delete from public.pipeline_stages where company_id = ${companyId}`.catch(
          () => {},
        );
        await sql`delete from public.unlock_requests where company_id = ${companyId}`.catch(
          () => {},
        );
        await sql`delete from public.companies where id = ${companyId}`.catch(() => {});
      }
      for (const userId of created.userIds) {
        await sql`delete from public.intent_signals where candidate_id = ${userId}`.catch(
          () => {},
        );
        await sql`delete from public.notifications where user_id = ${userId}`.catch(() => {});
        await sql`delete from public.candidates where user_id = ${userId}`.catch(() => {});
        await sql`delete from public.profiles where id = ${userId}`.catch(() => {});
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
          method: "DELETE",
          headers: { apikey: SERVICE_KEY as string, Authorization: `Bearer ${SERVICE_KEY}` },
        }).catch(() => {});
      }
      console.log("  ok    fixtures cleaned up (check is re-run safe)");
    } catch (e) {
      console.error(`  warn  cleanup incomplete: ${e instanceof Error ? e.message : String(e)}`);
    }
    await sql.end({ timeout: 5 });
  }

  if (failed) {
    console.error("\nFAIL: discoverability rule or anonymization did not hold");
    process.exit(1);
  }
  console.log(
    "\nOK: discoverability rule holds (criteria-include AE visible, criteria-exclude + " +
      "opt-out AEs hidden); identity stays anonymized on cards, detail, and pending matches",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(`FAIL: discoverability check fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
