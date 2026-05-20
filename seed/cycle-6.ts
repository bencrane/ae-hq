// Cycle-6 seed — intent, consent & matchmaking.
//
// Populates three things on top of the cycle-1..5 seed:
//   1. `company_match_criteria` for all 20 companies — a company's standing
//      consent (segments, sales_motions, min_years, worked-at, investor pedigree).
//   2. Extended `intent_signals` — investor criteria, watched companies, and the
//      auto_match / discoverable toggles, varied across the 100 anon candidates.
//      `candidate1` (the test candidate) gets auto_match=true + rich criteria.
//   3. ~30 `matches` across resolved / pending_ae / pending_company so every
//      cycle-6 surface has content. `candidate1` gets >= 1 pending_ae; Stripe
//      gets >= 1 pending_company.
//
// Idempotency: `matches` and `company_match_criteria` are truncated at the top
// of the main seed (index.ts), so this module always inserts a fresh,
// deterministic set — the verifier runs `bun run seed` twice and fails
// criterion 5 if the matches count drifts. Every choice here is a fixed walk
// (NOT Math.random), so the row count is identical across re-runs. The
// extended intent_signals columns are UPDATEd onto the rows the cycle-1 loop
// already inserted (a plain UPDATE keyed on candidate_id — no row churn).
//
// A resolved match MUST carry a conversation_id (the cycle-3 conversations
// table is reused); a pending match MUST NOT. This module creates the
// conversation rows for the resolved matches it seeds — `conversations` has a
// UNIQUE(candidate_id, company_id), so a (company, candidate) pair gets at most
// one thread.

import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

// Match-criteria archetypes. A company's criteria reflect how it actually
// hires — an enterprise seller wants enterprise-segment AEs with real tenure;
// a PLG company is far more open. `investor_pedigree` lists VC firms; an AE
// "has the pedigree" if they worked at a company those VCs backed.
type CriteriaArchetype = {
  segments: string[];
  sales_motions: string[];
  min_years_experience: number;
  investor_pedigree: string[];
};

// Per-company match criteria, keyed by slug. Real-shaped: each company's
// criteria are consistent with its own firmographics (an enterprise-motion
// company asks for enterprise AEs). investor_pedigree picks well-known VCs so
// the investor dimension is testable. worked_at_company_ids is filled at seed
// time (it needs resolved uuids) — see seedCycle6.
const CRITERIA_BY_SLUG: Record<string, CriteriaArchetype> = {
  stripe: {
    segments: ["Enterprise", "StrategicEnterprise"],
    sales_motions: ["enterprise", "hybrid"],
    min_years_experience: 5,
    investor_pedigree: ["Sequoia Capital", "Andreessen Horowitz"],
  },
  snowflake: {
    segments: ["Enterprise", "StrategicEnterprise"],
    sales_motions: ["enterprise"],
    min_years_experience: 6,
    investor_pedigree: ["Sequoia Capital", "Altimeter Capital"],
  },
  mongodb: {
    segments: ["MidMarket", "Enterprise"],
    sales_motions: ["hybrid", "sales_led"],
    min_years_experience: 4,
    investor_pedigree: ["Sequoia Capital"],
  },
  datadog: {
    segments: ["MidMarket", "Enterprise"],
    sales_motions: ["sales_led"],
    min_years_experience: 4,
    investor_pedigree: ["Index Ventures"],
  },
  hashicorp: {
    segments: ["Enterprise"],
    sales_motions: ["hybrid", "enterprise"],
    min_years_experience: 5,
    investor_pedigree: ["Bessemer Venture Partners", "GGV Capital"],
  },
  plaid: {
    segments: ["MidMarket", "Enterprise"],
    sales_motions: ["sales_led"],
    min_years_experience: 3,
    investor_pedigree: ["Andreessen Horowitz", "Kleiner Perkins"],
  },
  vercel: {
    segments: ["SMB", "MidMarket"],
    sales_motions: [],
    min_years_experience: 2,
    investor_pedigree: ["Accel"],
  },
  linear: {
    segments: ["SMB", "MidMarket"],
    sales_motions: ["plg"],
    min_years_experience: 2,
    investor_pedigree: ["Sequoia Capital", "Accel"],
  },
  notion: {
    segments: ["SMB", "MidMarket"],
    sales_motions: ["plg"],
    min_years_experience: 2,
    investor_pedigree: ["Index Ventures"],
  },
  anthropic: {
    segments: ["Enterprise", "StrategicEnterprise"],
    sales_motions: ["enterprise"],
    min_years_experience: 5,
    investor_pedigree: ["Spark Capital", "Menlo Ventures"],
  },
  openai: {
    segments: ["Enterprise", "StrategicEnterprise"],
    sales_motions: ["enterprise"],
    min_years_experience: 5,
    investor_pedigree: ["Khosla Ventures", "Thrive Capital"],
  },
  ramp: {
    segments: ["MidMarket", "Enterprise"],
    sales_motions: ["sales_led"],
    min_years_experience: 3,
    investor_pedigree: ["Founders Fund", "Khosla Ventures"],
  },
  brex: {
    segments: ["MidMarket", "Enterprise"],
    sales_motions: ["sales_led"],
    min_years_experience: 3,
    investor_pedigree: ["Ribbit Capital", "DST Global"],
  },
  mercury: {
    segments: ["SMB", "MidMarket"],
    sales_motions: ["plg"],
    min_years_experience: 2,
    investor_pedigree: ["Andreessen Horowitz", "CRV"],
  },
  retool: {
    segments: ["MidMarket", "Enterprise"],
    sales_motions: ["hybrid"],
    min_years_experience: 3,
    investor_pedigree: ["Sequoia Capital", "Altimeter Capital"],
  },
  render: {
    segments: ["SMB", "MidMarket"],
    sales_motions: ["plg"],
    min_years_experience: 2,
    investor_pedigree: ["General Catalyst", "Bessemer Venture Partners"],
  },
  modal: {
    segments: ["SMB", "MidMarket"],
    sales_motions: [],
    min_years_experience: 1,
    investor_pedigree: ["Redpoint Ventures", "Lux Capital"],
  },
  replit: {
    segments: ["SMB", "MidMarket"],
    sales_motions: ["plg"],
    min_years_experience: 2,
    investor_pedigree: ["Andreessen Horowitz", "Khosla Ventures"],
  },
  cursor: {
    segments: ["SMB", "MidMarket"],
    sales_motions: ["plg"],
    min_years_experience: 1,
    investor_pedigree: ["Andreessen Horowitz", "Thrive Capital"],
  },
  supabase: {
    segments: ["SMB", "MidMarket"],
    sales_motions: ["plg"],
    min_years_experience: 2,
    investor_pedigree: ["Y Combinator", "Coatue Management"],
  },
};

// Investor pools the anon candidates declare interest in — real VC firms, so
// the cycle-6 investor dimension is exercised against actual firmographic data.
const INVESTOR_POOL = [
  "Sequoia Capital",
  "Andreessen Horowitz",
  "Khosla Ventures",
  "Index Ventures",
  "Accel",
  "Founders Fund",
  "Bessemer Venture Partners",
  "General Catalyst",
];

export type Cycle6SeedArgs = {
  sql: Sql;
  /** company slug -> company uuid (from the main seed's insert loop). */
  companyIds: Map<string, string>;
  /** Stripe's company id — needs >= 1 pending_company match. */
  stripeCompanyId: string;
  /** The test candidate (candidate1) — auto_match=true + >= 1 pending_ae match. */
  testCandidateId: string;
  /** The test recruiter's user id — the created_by on company-initiated rows. */
  recruiterId: string;
  /** Every anonymous candidate user_id seeded by the main loop. */
  anonCandidateIds: string[];
};

export type Cycle6SeedResult = {
  matchCriteria: number;
  intentExtended: number;
  matches: number;
  conversations: number;
};

/**
 * Seed cycle-6 match criteria, extended intent, and ~30 matches.
 *
 * Fully deterministic — fixed walks, no Math.random — so a re-run produces an
 * identical row count (criterion 5 idempotency).
 */
export async function seedCycle6({
  sql,
  companyIds,
  stripeCompanyId,
  testCandidateId,
  recruiterId,
  anonCandidateIds,
}: Cycle6SeedArgs): Promise<Cycle6SeedResult> {
  // ── 1. company_match_criteria for all 20 companies ──────────────────────
  // worked_at_company_ids: each company asks for AEs who worked at a couple of
  // "tier-1" companies. Use a fixed pair (the first two seeded companies) so
  // the dimension is non-empty and deterministic.
  const orderedSlugs = [...companyIds.keys()];
  const workedAtPair = orderedSlugs
    .slice(0, 2)
    .map((s) => companyIds.get(s))
    .filter((v): v is string => Boolean(v));

  let matchCriteria = 0;
  for (const slug of orderedSlugs) {
    const companyId = companyIds.get(slug);
    if (!companyId) continue;
    const c = CRITERIA_BY_SLUG[slug] ?? {
      segments: [],
      sales_motions: [],
      min_years_experience: 0,
      investor_pedigree: [],
    };
    await sql`
      insert into public.company_match_criteria
        (company_id, segments, sales_motions, min_years_experience,
         worked_at_company_ids, investor_pedigree, updated_at)
      values (
        ${companyId}::uuid,
        ${c.segments},
        ${c.sales_motions},
        ${c.min_years_experience},
        ${workedAtPair},
        ${c.investor_pedigree},
        now()
      )
      on conflict (company_id) do update set
        segments               = excluded.segments,
        sales_motions          = excluded.sales_motions,
        min_years_experience   = excluded.min_years_experience,
        worked_at_company_ids  = excluded.worked_at_company_ids,
        investor_pedigree      = excluded.investor_pedigree,
        updated_at             = now()
    `;
    matchCriteria++;
  }

  // ── 2. extended intent_signals ──────────────────────────────────────────
  // candidate1: auto_match=true, rich criteria (investors + a watched company),
  // discoverable=true. The cycle-1 loop already seeded its target_stages /
  // target_segments — UPDATE adds the cycle-6 dimensions on top.
  const stripeId = companyIds.get("stripe") ?? stripeCompanyId;
  const notionId = companyIds.get("notion") ?? stripeId;
  await sql`
    update public.intent_signals
    set target_investors = ${["Sequoia Capital", "Andreessen Horowitz", "Khosla Ventures"]},
        watched_companies = ${[stripeId, notionId]}::uuid[],
        auto_match = true,
        discoverable = true
    where candidate_id = ${testCandidateId}::uuid
  `;
  let intentExtended = 1;

  // anon candidates: vary investors / watched / auto_match deterministically.
  // - every 3rd candidate gets auto_match=true (so BOTH values are present).
  // - investors: a rotating 2-firm slice of the INVESTOR_POOL.
  // - every 4th candidate watches one company.
  // - every 7th candidate opts out (discoverable=false) so the discoverability
  //   filter has opt-out rows to exclude.
  const companyIdList = [...companyIds.values()];
  for (let i = 0; i < anonCandidateIds.length; i++) {
    const candidateId = anonCandidateIds[i];
    if (!candidateId || candidateId === testCandidateId) continue;
    const investors = [
      INVESTOR_POOL[i % INVESTOR_POOL.length] as string,
      INVESTOR_POOL[(i + 3) % INVESTOR_POOL.length] as string,
    ];
    const watched = i % 4 === 0 ? [companyIdList[i % companyIdList.length] as string] : [];
    const autoMatch = i % 3 === 0;
    const discoverable = i % 7 !== 0;
    await sql`
      update public.intent_signals
      set target_investors = ${investors},
          watched_companies = ${watched}::uuid[],
          auto_match = ${autoMatch},
          discoverable = ${discoverable}
      where candidate_id = ${candidateId}::uuid
    `;
    intentExtended++;
  }

  // ── 3. ~30 matches across resolved / pending_ae / pending_company ───────
  // Deterministic plan. The match state machine's invariants MUST hold:
  //   - resolved  ⇒ conversation_id + resolved_at set, consents not pending
  //   - pending_* ⇒ conversation_id NULL
  // A resolved match needs a conversations row; conversations is UNIQUE on
  // (candidate_id, company_id), so a pair gets one thread. Build the
  // conversation first, then the match pointing at it.
  type MatchPlan = {
    companyId: string;
    candidateId: string;
    origin: "ae_initiated" | "company_initiated";
    aeConsent: "standing" | "explicit" | "pending";
    companyConsent: "standing" | "explicit" | "pending";
    status: "resolved" | "pending_ae" | "pending_company";
  };
  const plan: MatchPlan[] = [];
  const usedPairs = new Set<string>();

  function pushMatch(p: MatchPlan): boolean {
    const key = `${p.companyId}::${p.candidateId}`;
    if (usedPairs.has(key)) return false;
    usedPairs.add(key);
    plan.push(p);
    return true;
  }

  // 3a. candidate1 — a pending_ae match (the surviving manual approval; the
  //     AE's /me/approvals must have content). A company expressed interest;
  //     candidate1's auto_match path did not resolve it (this row models a
  //     company whose criteria the AE does not fully satisfy, so the AE's
  //     standing consent was not granted — explicit accept needed).
  pushMatch({
    companyId: companyIds.get("snowflake") ?? stripeId,
    candidateId: testCandidateId,
    origin: "company_initiated",
    aeConsent: "pending",
    companyConsent: "explicit",
    status: "pending_ae",
  });
  // 3b. candidate1 — a resolved match (the inbox / a resolved conversation has
  //     content for the test candidate).
  pushMatch({
    companyId: companyIds.get("linear") ?? stripeId,
    candidateId: testCandidateId,
    origin: "ae_initiated",
    aeConsent: "explicit",
    companyConsent: "standing",
    status: "resolved",
  });

  // 3c. Stripe — a pending_company match (the company inbound-interest surface
  //     must have content). An AE expressed interest; Stripe's criteria are not
  //     yet satisfied / not standing, so it awaits Stripe's explicit accept.
  const stripeInbound = anonCandidateIds.slice(0, 3);
  for (const candidateId of stripeInbound) {
    if (!candidateId) continue;
    pushMatch({
      companyId: stripeId,
      candidateId,
      origin: "ae_initiated",
      aeConsent: "explicit",
      companyConsent: "pending",
      status: "pending_company",
    });
  }

  // 3d. fill to ~30 with a deterministic walk. Cycle the status across the
  //     three live states; cycle origin/consents consistently with each status.
  const STATUSES: MatchPlan["status"][] = ["resolved", "pending_company", "pending_ae"];
  let candCursor = 3; // 0..2 already used for Stripe inbound
  let coCursor = 0;
  let guard = 0;
  while (plan.length < 32 && guard < 32 * 30) {
    guard++;
    const candidateId = anonCandidateIds[candCursor % anonCandidateIds.length];
    const slug = orderedSlugs[coCursor % orderedSlugs.length] as string;
    const companyId = companyIds.get(slug);
    candCursor += 1;
    coCursor += 3;
    if (!candidateId || !companyId || candidateId === testCandidateId) continue;
    const status = STATUSES[plan.length % STATUSES.length] as MatchPlan["status"];
    if (status === "resolved") {
      pushMatch({
        companyId,
        candidateId,
        origin: plan.length % 2 === 0 ? "ae_initiated" : "company_initiated",
        aeConsent: plan.length % 2 === 0 ? "explicit" : "standing",
        companyConsent: plan.length % 2 === 0 ? "standing" : "explicit",
        status: "resolved",
      });
    } else if (status === "pending_company") {
      pushMatch({
        companyId,
        candidateId,
        origin: "ae_initiated",
        aeConsent: "explicit",
        companyConsent: "pending",
        status: "pending_company",
      });
    } else {
      pushMatch({
        companyId,
        candidateId,
        origin: "company_initiated",
        aeConsent: "pending",
        companyConsent: "explicit",
        status: "pending_ae",
      });
    }
  }

  // ── insert the matches (+ conversations for resolved ones) ──────────────
  let matches = 0;
  let conversations = 0;
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i] as MatchPlan;
    const createdMs = Date.now() - ((i % 28) + 1) * 86400_000;
    const createdAt = new Date(createdMs).toISOString();

    let conversationId: string | null = null;
    let resolvedAt: string | null = null;
    if (p.status === "resolved") {
      // a resolved match opens a conversation. created_by is the initiating
      // side's user — the recruiter for company_initiated, the candidate for
      // ae_initiated. conversations is UNIQUE(candidate_id, company_id).
      const createdBy = p.origin === "company_initiated" ? recruiterId : p.candidateId;
      const [conv] = await sql<{ id: string }[]>`
        insert into public.conversations
          (candidate_id, company_id, created_by, status, created_at)
        values (
          ${p.candidateId}::uuid, ${p.companyId}::uuid, ${createdBy}::uuid,
          'active', ${createdAt}
        )
        on conflict (candidate_id, company_id) do update set status = 'active'
        returning id
      `;
      conversationId = conv?.id ?? null;
      if (conv) conversations++;
      resolvedAt = createdAt;
    }

    const [m] = await sql<{ id: string }[]>`
      insert into public.matches
        (company_id, candidate_id, job_id, origin, ae_consent, company_consent,
         status, conversation_id, created_at, resolved_at)
      values (
        ${p.companyId}::uuid, ${p.candidateId}::uuid, ${null},
        ${p.origin}, ${p.aeConsent}, ${p.companyConsent}, ${p.status},
        ${conversationId}, ${createdAt}, ${resolvedAt}
      )
      on conflict (company_id, candidate_id, job_id) do nothing
      returning id
    `;
    if (m) matches++;
  }

  return { matchCriteria, intentExtended, matches, conversations };
}
