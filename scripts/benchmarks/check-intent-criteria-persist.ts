#!/usr/bin/env tsx
/**
 * check-intent-criteria-persist.ts
 *
 * Criteria 9 + 10 verifier for /scope cycle
 * `ae-hq-intent-consent-matchmaking`.
 *
 * Criterion 9 — the AE intent surface lets an AE declare investor criteria,
 *   watch a company, and toggle auto_match + discoverable, and it PERSISTS.
 * Criterion 10 — the company match-criteria surface persists criteria.
 *
 * The e2e cycle-6 spec drives the actual UI (tag-pickers, toggles). This
 * scripted check proves the BFF persistence contract underneath:
 *   - GET  /api/v1/candidates/me/intent           returns the current intent
 *   - PUT  /api/v1/candidates/me/intent           persists target_investors,
 *          watched_companies, auto_match, discoverable
 *   - a follow-up GET reflects exactly what was PUT (round-trip)
 *   - GET  /api/v1/company/match-criteria          returns current criteria
 *   - PUT  /api/v1/company/match-criteria          persists segments,
 *          sales_motions, min_years_experience, worked_at_company_ids,
 *          investor_pedigree
 *   - a follow-up GET reflects exactly what was PUT
 *
 * It uses a HERMETIC fixture AE + company (minted throwaway accounts) so it
 * never mutates the seeded candidate1 / Stripe intent, and restores nothing
 * because the fixtures are deleted wholesale on exit.
 *
 * Robustness: the PUT body shapes are the executor's zod schemas. This check
 * sends the four documented intent fields and the five documented criteria
 * fields by their directive names. If the executor names a column
 * differently, criterion 4 (schema) already fails; here we assert the
 * round-trip on the directive's field names — the GET response must echo the
 * values back under inspectable keys. A watched_companies value is a real
 * seeded company uuid so a FK constraint (if any) is satisfied.
 *
 * Required env:
 *   API_URL, AE_SUPABASE_URL|VITE_SUPABASE_URL,
 *   AE_SUPABASE_ANON_KEY|VITE_SUPABASE_PUBLISHABLE_KEY,
 *   AE_SUPABASE_SERVICE_ROLE_KEY, AE_DB_DIRECT_URL
 *
 * Exit codes:
 *   0 — both surfaces persist their criteria across a GET/PUT/GET round-trip
 *   1 — a value did not persist
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

/** find a value at a key anywhere in a (shallow-ish) object graph. */
function deepFind(obj: unknown, key: string): unknown {
  if (obj === null || typeof obj !== "object") return undefined;
  if (Array.isArray(obj)) {
    for (const el of obj) {
      const r = deepFind(el, key);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  const rec = obj as Record<string, unknown>;
  if (key in rec) return rec[key];
  for (const v of Object.values(rec)) {
    const r = deepFind(v, key);
    if (r !== undefined) return r;
  }
  return undefined;
}

function arrEq(a: unknown, b: string[]): boolean {
  if (!Array.isArray(a)) return false;
  const as = [...(a as unknown[])].map(String).sort();
  const bs = [...b].sort();
  return as.length === bs.length && as.every((v, i) => v === bs[i]);
}

async function main() {
  try {
    // ── pick a real company uuid for watched_companies / worked_at ─────────
    const coRows = await sql<{ id: string }[]>`
      select id::text from public.companies order by created_at limit 2
    `;
    if (coRows.length < 1) throw new Error("no companies in DB to reference");
    const watchedCo = coRows[0].id;
    const workedAtCo = coRows[coRows.length - 1].id;

    // ════════════════ CRITERION 9 — AE intent round-trip ════════════════
    console.log("\n── Criterion 9 — /me/intent persists investors / watched / toggles");
    const aeEmail = `c6-persist-ae-${RUN}@persist.test`;
    const aeId = await adminCreateUser(aeEmail);
    await sql`
      insert into public.profiles (user_id, kind, email, name)
      values (${aeId}, 'candidate', ${aeEmail}, 'Persist AE')
      on conflict (user_id) do nothing
    `;
    await sql`
      insert into public.candidates (user_id, headline, segment_focus)
      values (${aeId}, 'Persist AE headline', 'Enterprise')
      on conflict (user_id) do nothing
    `;
    const aeToken = await mintToken(aeEmail);

    // GET must work even before any PUT (the cycle-1 endpoint upserts a row
    // at signup; a hermetic fixture may need a baseline GET to not 500).
    const get0 = await api("GET", "/api/v1/candidates/me/intent", aeToken);
    if (get0.status !== 200) {
      // not fatal — some implementations only create the row on PUT.
      console.log(`  ok    initial GET /me/intent -> ${get0.status} (row may be PUT-created)`);
    } else {
      ok("GET /me/intent reachable");
    }

    const investors = ["Khosla Ventures", "Sequoia Capital"];
    const putIntent = await api("PUT", "/api/v1/candidates/me/intent", aeToken, {
      target_stages: ["SeriesB", "SeriesC"],
      target_segments: ["Enterprise"],
      target_geos: ["Remote - US"],
      target_companies: [],
      comp_ote_min: 220000,
      target_investors: investors,
      watched_companies: [watchedCo],
      auto_match: true,
      discoverable: false,
    });
    if (putIntent.status < 200 || putIntent.status >= 300) {
      fail(`PUT /me/intent -> ${putIntent.status}: ${putIntent.text.slice(0, 240)}`);
    } else {
      ok(`PUT /me/intent accepted (${putIntent.status})`);

      // round-trip GET
      const get1 = await api("GET", "/api/v1/candidates/me/intent", aeToken);
      if (get1.status !== 200) {
        fail(`follow-up GET /me/intent -> ${get1.status}`);
      } else {
        const gotInvestors = deepFind(get1.body, "target_investors");
        const gotWatched = deepFind(get1.body, "watched_companies");
        const gotAuto = deepFind(get1.body, "auto_match");
        const gotDisc = deepFind(get1.body, "discoverable");
        if (arrEq(gotInvestors, investors)) {
          ok("target_investors persisted (investor dimension — feedback #20)");
        } else {
          fail(`target_investors did not persist — got ${JSON.stringify(gotInvestors)}`);
        }
        if (arrEq(gotWatched, [watchedCo])) {
          ok("watched_companies persisted");
        } else {
          fail(`watched_companies did not persist — got ${JSON.stringify(gotWatched)}`);
        }
        if (gotAuto === true) {
          ok("auto_match persisted as true");
        } else {
          fail(`auto_match did not persist — got ${JSON.stringify(gotAuto)}`);
        }
        if (gotDisc === false) {
          ok("discoverable persisted as false");
        } else {
          fail(`discoverable did not persist — got ${JSON.stringify(gotDisc)}`);
        }
      }

      // DB-level confirmation — the row actually carries the values.
      const dbRow = await sql<
        { target_investors: string[]; auto_match: boolean; discoverable: boolean }[]
      >`
        select target_investors, auto_match, discoverable
        from public.intent_signals where candidate_id = ${aeId}
      `;
      if (
        dbRow[0] &&
        arrEq(dbRow[0].target_investors, investors) &&
        dbRow[0].auto_match === true &&
        dbRow[0].discoverable === false
      ) {
        ok("intent_signals row in the DB carries the PUT values");
      } else {
        fail(`intent_signals DB row does not match the PUT — ${JSON.stringify(dbRow[0])}`);
      }
    }

    // ════════════════ CRITERION 10 — company match-criteria ═════════════
    console.log("\n── Criterion 10 — /company/match-criteria persists company criteria");
    const recEmail = `c6-persist-rec-${RUN}@persist.test`;
    const recId = await adminCreateUser(recEmail);
    const coIns = await sql<{ id: string }[]>`
      insert into public.companies (slug, name)
      values (${`c6-persist-co-${RUN}`}, 'Persist Fixture Co')
      returning id::text
    `;
    const companyId = coIns[0].id;
    created.companyIds.push(companyId);
    await sql`
      insert into public.profiles (user_id, kind, email, name)
      values (${recId}, 'company_member', ${recEmail}, 'Persist Recruiter')
      on conflict (user_id) do nothing
    `;
    await sql`
      insert into public.company_members (company_id, user_id, role)
      values (${companyId}, ${recId}, 'admin')
    `;
    const recToken = await mintToken(recEmail);

    const putCriteria = await api("PUT", "/api/v1/company/match-criteria", recToken, {
      segments: ["Enterprise", "MidMarket"],
      sales_motions: ["land_and_expand"],
      min_years_experience: 5,
      worked_at_company_ids: [workedAtCo],
      investor_pedigree: ["Khosla Ventures"],
    });
    if (putCriteria.status < 200 || putCriteria.status >= 300) {
      fail(`PUT /company/match-criteria -> ${putCriteria.status}: ${putCriteria.text.slice(0, 240)}`);
    } else {
      ok(`PUT /company/match-criteria accepted (${putCriteria.status})`);

      const getCriteria = await api("GET", "/api/v1/company/match-criteria", recToken);
      if (getCriteria.status !== 200) {
        fail(`follow-up GET /company/match-criteria -> ${getCriteria.status}`);
      } else {
        const gotSegs = deepFind(getCriteria.body, "segments");
        const gotMotions = deepFind(getCriteria.body, "sales_motions");
        const gotYears = deepFind(getCriteria.body, "min_years_experience");
        const gotWorked = deepFind(getCriteria.body, "worked_at_company_ids");
        const gotPedigree = deepFind(getCriteria.body, "investor_pedigree");
        if (arrEq(gotSegs, ["Enterprise", "MidMarket"])) {
          ok("segments persisted");
        } else {
          fail(`segments did not persist — got ${JSON.stringify(gotSegs)}`);
        }
        if (arrEq(gotMotions, ["land_and_expand"])) {
          ok("sales_motions persisted");
        } else {
          fail(`sales_motions did not persist — got ${JSON.stringify(gotMotions)}`);
        }
        if (gotYears === 5) {
          ok("min_years_experience persisted");
        } else {
          fail(`min_years_experience did not persist — got ${JSON.stringify(gotYears)}`);
        }
        if (arrEq(gotWorked, [workedAtCo])) {
          ok("worked_at_company_ids persisted");
        } else {
          fail(`worked_at_company_ids did not persist — got ${JSON.stringify(gotWorked)}`);
        }
        if (arrEq(gotPedigree, ["Khosla Ventures"])) {
          ok("investor_pedigree persisted");
        } else {
          fail(`investor_pedigree did not persist — got ${JSON.stringify(gotPedigree)}`);
        }
      }

      const cmcRow = await sql<{ min_years_experience: number; segments: string[] }[]>`
        select min_years_experience, segments
        from public.company_match_criteria where company_id = ${companyId}
      `;
      if (cmcRow[0] && cmcRow[0].min_years_experience === 5 && arrEq(cmcRow[0].segments, ["Enterprise", "MidMarket"])) {
        ok("company_match_criteria row in the DB carries the PUT values");
      } else {
        fail(`company_match_criteria DB row does not match the PUT — ${JSON.stringify(cmcRow[0])}`);
      }
    }
  } catch (e) {
    fail(`intent/criteria persist check threw: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    try {
      for (const companyId of created.companyIds) {
        await sql`delete from public.company_match_criteria where company_id = ${companyId}`.catch(
          () => {},
        );
        await sql`delete from public.company_members where company_id = ${companyId}`.catch(
          () => {},
        );
        await sql`delete from public.companies where id = ${companyId}`.catch(() => {});
      }
      for (const userId of created.userIds) {
        await sql`delete from public.intent_signals where candidate_id = ${userId}`.catch(
          () => {},
        );
        await sql`delete from public.candidates where user_id = ${userId}`.catch(() => {});
        await sql`delete from public.profiles where user_id = ${userId}`.catch(() => {});
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
    console.error("\nFAIL: intent / match-criteria did not persist across the round-trip");
    process.exit(1);
  }
  console.log(
    "\nOK: /me/intent persists investors + watched companies + auto_match + discoverable; " +
      "/company/match-criteria persists all five criteria fields",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(`FAIL: intent/criteria persist check fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
