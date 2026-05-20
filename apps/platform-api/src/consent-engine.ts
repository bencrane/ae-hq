/**
 * The consent engine — cycle 6.
 *
 * A **match** connects one company and one AE. A match resolves to an open
 * conversation the instant BOTH sides have consented. Each side's consent is
 * either **standing** (pre-set criteria / a setting) or **explicit** (a
 * per-match tap). This module owns:
 *
 *   1. The deterministic predicate evaluator — does an AE satisfy a company's
 *      match-criteria? does a company satisfy an AE's declared criteria? Pure
 *      SQL/predicate checks: segment / motion / years / worked-at / investor
 *      intersection. NO ranking, NO ML, NO score. An empty criteria array
 *      means "no constraint on this dimension" — the only sane reading.
 *
 *   2. The match-resolution function — on an interest action it evaluates both
 *      sides and either RESOLVES the match (creates the conversation, sets
 *      status='resolved' + conversation_id + resolved_at, fires the cycle-3
 *      notification) or records a PENDING match and notifies the side that
 *      must act. Resolution is IDEMPOTENT — a duplicate interest action finds
 *      the existing match (UNIQUE(company,candidate,job)) and does not create a
 *      second match or a second conversation.
 *
 * The directive's model:
 *   AE-initiated  — AE consent = explicit; company consent = standing iff the
 *                   AE satisfies the company's criteria, else pending.
 *   Company-init  — company consent = explicit; AE consent = standing iff the
 *                   AE has auto_match=true AND the company satisfies the AE's
 *                   own declared criteria, else pending.
 *   Both consents non-pending → resolve. Otherwise the match sits in
 *   pending_company (awaiting the company's explicit accept) or pending_ae
 *   (awaiting the AE's explicit accept — the one surviving manual approval).
 */

import { supabaseAdmin } from "./db";
import { deriveSalesMotion, type SalesMotion } from "@ae-hq/shared";
import { ensureConversation } from "./routes/conversations";

// ───────────────────────── predicate inputs ─────────────────────────

/** A company's standing-consent criteria (the `company_match_criteria` row). */
export type CompanyMatchCriteria = {
  segments: string[];
  sales_motions: string[];
  min_years_experience: number;
  worked_at_company_ids: string[];
  investor_pedigree: string[];
};

/** An AE's declared criteria (the cycle-6-extended `intent_signals` row). */
export type AeIntent = {
  target_stages: string[];
  target_segments: string[];
  comp_ote_min: number | null;
  target_companies: string[];
  target_investors: string[];
  watched_companies: string[];
  auto_match: boolean;
  discoverable: boolean;
};

/** The candidate facts the company-criteria predicate is evaluated against. */
export type CandidateFacts = {
  candidateId: string;
  segmentFocus: string | null;
  /** derived sales motion (from work-history company motions) */
  salesMotion: SalesMotion | null;
  yearsExperience: number;
  /** company ids the candidate has in their work history */
  workedAtCompanyIds: string[];
  /** distinct investors of every company the candidate worked at */
  workedAtInvestors: string[];
};

/** The company facts the AE-criteria (exposure) predicate is evaluated against. */
export type CompanyFacts = {
  companyId: string;
  stage: string | null;
  investors: string[];
};

// ───────────────────────── predicate helpers ─────────────────────────

/** Case-sensitive set intersection — true iff a and b share any element. */
function intersects(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return b.some((v) => set.has(v));
}

/**
 * Does this AE satisfy this company's match-criteria? Deterministic predicate —
 * every dimension is an AND. An EMPTY criteria array is "no constraint" (a
 * company that listed no segments is open to every segment); a missing
 * criteria row entirely is also "no constraint" (handled by the caller).
 *
 * Dimensions:
 *   - segments       : the AE's segment_focus is in criteria.segments
 *   - sales_motions  : the AE's derived sales motion is in criteria.sales_motions
 *   - min_years      : the AE's years of experience >= criteria.min_years
 *   - worked_at      : the AE's work-history companies intersect criteria
 *   - investor       : the investors of the AE's work-history companies
 *                      intersect criteria.investor_pedigree
 */
export function aeSatisfiesCompanyCriteria(
  candidate: CandidateFacts,
  criteria: CompanyMatchCriteria,
): boolean {
  // segment — the AE's segment_focus must be one the company wants.
  if (criteria.segments.length > 0) {
    if (!candidate.segmentFocus || !criteria.segments.includes(candidate.segmentFocus)) {
      return false;
    }
  }
  // sales motion — the AE's derived motion must be one the company wants.
  if (criteria.sales_motions.length > 0) {
    if (!candidate.salesMotion || !criteria.sales_motions.includes(candidate.salesMotion)) {
      return false;
    }
  }
  // years — at-or-above the floor.
  if (candidate.yearsExperience < criteria.min_years_experience) {
    return false;
  }
  // worked-at — the AE worked at one of the named companies.
  if (criteria.worked_at_company_ids.length > 0) {
    if (!intersects(candidate.workedAtCompanyIds, criteria.worked_at_company_ids)) {
      return false;
    }
  }
  // investor pedigree — the AE worked at a company backed by one of these VCs.
  if (criteria.investor_pedigree.length > 0) {
    if (!intersects(candidate.workedAtInvestors, criteria.investor_pedigree)) {
      return false;
    }
  }
  return true;
}

/**
 * Does this company satisfy this AE's declared criteria? This is BOTH the
 * AE-side standing-consent precondition AND the discoverability exposure
 * filter — the AE's criteria double as their exposure filter (directive's
 * discoverability rule). Deterministic predicate, every dimension an AND. An
 * empty AE criteria array is "no constraint".
 *
 * Dimensions:
 *   - target_stages    : the company's funding stage is one the AE is open to
 *   - target_companies : (if set) the company is in the AE's explicit list
 *                        OR the AE's watched_companies — these widen the gate,
 *                        they never narrow it, so they are an OR with the
 *                        stage check via the `explicitlyNamed` short-circuit
 *   - target_investors : the company's investors intersect the AE's
 *                        target_investors
 *
 * If the AE explicitly named this company (target_companies or
 * watched_companies), they have declared interest in it directly — that
 * satisfies the exposure filter regardless of stage/investor. Otherwise the
 * stage AND investor dimensions must both pass.
 */
export function companySatisfiesAeCriteria(company: CompanyFacts, ae: AeIntent): boolean {
  // an AE who explicitly named the company has declared direct interest.
  const explicitlyNamed =
    ae.target_companies.includes(company.companyId) ||
    ae.watched_companies.includes(company.companyId);
  if (explicitlyNamed) return true;

  // stage — the company's funding stage must be one the AE is open to.
  if (ae.target_stages.length > 0) {
    if (!company.stage || !ae.target_stages.includes(company.stage)) {
      return false;
    }
  }
  // investor — the company must be backed by a VC the AE wants to hear from.
  if (ae.target_investors.length > 0) {
    if (!intersects(company.investors, ae.target_investors)) {
      return false;
    }
  }
  return true;
}

// ───────────────────────── fact loaders ─────────────────────────

/** Load the candidate facts the company-criteria predicate needs. */
export async function loadCandidateFacts(candidateId: string): Promise<CandidateFacts | null> {
  const { data: cand } = await supabaseAdmin
    .from("candidates")
    .select("user_id, segment_focus")
    .eq("user_id", candidateId)
    .maybeSingle();
  if (!cand) return null;

  const { data: history } = await supabaseAdmin
    .from("ae_work_history")
    .select("start_date, end_date, companies(id, sales_motion, investors)")
    .eq("candidate_id", candidateId);

  type HistoryRow = {
    start_date: string;
    end_date: string | null;
    companies: { id: string; sales_motion: SalesMotion | null; investors: string[] | null } | null;
  };
  const rows = (history ?? []) as unknown as HistoryRow[];

  // years — sum of every tenure, at least 1 (mirrors the /company/candidates
  // derivation so the predicate and the cards agree).
  const years = Math.max(
    1,
    Math.round(
      rows.reduce((acc, h) => {
        const start = new Date(h.start_date).getTime();
        const end = h.end_date ? new Date(h.end_date).getTime() : Date.now();
        return acc + (end - start) / (1000 * 60 * 60 * 24 * 365);
      }, 0),
    ),
  );
  const motion = deriveSalesMotion(rows.map((h) => h.companies?.sales_motion ?? null)).motion;
  const workedAtCompanyIds = Array.from(
    new Set(rows.map((h) => h.companies?.id).filter((v): v is string => Boolean(v))),
  );
  const workedAtInvestors = Array.from(
    new Set(rows.flatMap((h) => h.companies?.investors ?? [])),
  );

  return {
    candidateId,
    segmentFocus: cand.segment_focus ?? null,
    salesMotion: motion,
    yearsExperience: years,
    workedAtCompanyIds,
    workedAtInvestors,
  };
}

/** Load a company's match-criteria, or null if the company has set none. */
export async function loadCompanyCriteria(
  companyId: string,
): Promise<CompanyMatchCriteria | null> {
  const { data } = await supabaseAdmin
    .from("company_match_criteria")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) return null;
  // company_match_criteria is a cycle-6 table the generated DB types do not
  // know — cast the row to the criteria shape.
  const row = data as unknown as {
    segments: string[] | null;
    sales_motions: string[] | null;
    min_years_experience: number | null;
    worked_at_company_ids: string[] | null;
    investor_pedigree: string[] | null;
  };
  return {
    segments: row.segments ?? [],
    sales_motions: row.sales_motions ?? [],
    min_years_experience: row.min_years_experience ?? 0,
    worked_at_company_ids: row.worked_at_company_ids ?? [],
    investor_pedigree: row.investor_pedigree ?? [],
  };
}

/** Load an AE's declared intent (cycle-6 extended), or null if no row exists. */
export async function loadAeIntent(candidateId: string): Promise<AeIntent | null> {
  const { data } = await supabaseAdmin
    .from("intent_signals")
    .select("*")
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (!data) return null;
  // intent_signals carries the cycle-6 columns the generated DB types do not
  // yet know — cast the row to the cycle-6 shape.
  const row = data as unknown as {
    target_stages: string[] | null;
    target_segments: string[] | null;
    comp_ote_min: number | null;
    target_companies: string[] | null;
    target_investors: string[] | null;
    watched_companies: string[] | null;
    auto_match: boolean | null;
    discoverable: boolean | null;
  };
  return {
    target_stages: row.target_stages ?? [],
    target_segments: row.target_segments ?? [],
    comp_ote_min: row.comp_ote_min ?? null,
    target_companies: row.target_companies ?? [],
    target_investors: row.target_investors ?? [],
    watched_companies: row.watched_companies ?? [],
    auto_match: row.auto_match ?? false,
    discoverable: row.discoverable ?? true,
  };
}

/** Load the company facts the AE-criteria (exposure) predicate needs. */
export async function loadCompanyFacts(companyId: string): Promise<CompanyFacts | null> {
  const { data } = await supabaseAdmin
    .from("companies")
    .select("id, stage, investors")
    .eq("id", companyId)
    .maybeSingle();
  if (!data) return null;
  return {
    companyId: data.id,
    stage: data.stage ?? null,
    investors: (data.investors ?? []) as string[],
  };
}

// ───────────────────────── match resolution ─────────────────────────

export type MatchOrigin = "ae_initiated" | "company_initiated";
export type Consent = "standing" | "explicit" | "pending";
export type MatchStatus = "resolved" | "pending_ae" | "pending_company" | "declined" | "expired";

export type MatchRow = {
  id: string;
  company_id: string;
  candidate_id: string;
  job_id: string | null;
  origin: MatchOrigin;
  ae_consent: Consent;
  company_consent: Consent;
  status: MatchStatus;
  conversation_id: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type ResolveResult = {
  match: MatchRow;
  /** true if this call resolved the match (created the conversation). */
  resolvedNow: boolean;
  /** true if the match already existed before this call (idempotent path). */
  alreadyExisted: boolean;
};

/**
 * Notify a user that a match needs their explicit action, OR that a match has
 * resolved. A `notifications` row is the cycle-3 SSE delivery mechanism —
 * the notification-stream endpoint polls the table, so inserting the row both
 * persists the prompt AND delivers the live event. Best-effort: a notification
 * failure never fails the resolution.
 */
async function notify(
  userId: string,
  kind: "match_pending" | "match_resolved",
  payload: Record<string, unknown>,
): Promise<void> {
  await supabaseAdmin
    .from("notifications")
    .insert({ user_id: userId, kind, payload_json: payload })
    .then(
      () => {},
      () => {},
    );
}

/** Every company member's user_id — the recipients of a company-side notify. */
async function companyMemberIds(companyId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId);
  return (data ?? []).map((m) => m.user_id as string);
}

/**
 * Find the existing match for a (company, candidate, job) triple. job_id may be
 * null (a general talent match) — the partial unique index keeps that unique
 * per (company, candidate) too.
 */
async function findMatch(
  companyId: string,
  candidateId: string,
  jobId: string | null,
): Promise<MatchRow | null> {
  let qb = supabaseAdmin
    .from("matches")
    .select("*")
    .eq("company_id", companyId)
    .eq("candidate_id", candidateId);
  qb = jobId === null ? qb.is("job_id", null) : qb.eq("job_id", jobId);
  const { data } = await qb.maybeSingle();
  return (data as MatchRow | null) ?? null;
}

/**
 * Resolve a match: create the conversation (idempotent on
 * UNIQUE(candidate_id,company_id)), then flip the match row to resolved with
 * conversation_id + resolved_at + non-pending consents. Fires match_resolved
 * to BOTH sides. Idempotent — if the match is already resolved, returns it
 * untouched (no second conversation, no duplicate notification).
 */
async function resolveMatch(match: MatchRow, createdBy: string): Promise<MatchRow> {
  // already resolved — idempotent no-op (a second interest action must not
  // create a second conversation or fire a duplicate notification).
  if (match.status === "resolved" && match.conversation_id) {
    return match;
  }

  const conversation = await ensureConversation(match.company_id, match.candidate_id, createdBy);
  if (!conversation) {
    // could not open a conversation — leave the match as-is; a retry will
    // reconcile via the idempotent ensureConversation path.
    return match;
  }

  // collapse any still-pending consent to explicit — resolution implies both
  // sides have consented (a standing-consent side stays standing).
  const aeConsent: Consent = match.ae_consent === "pending" ? "explicit" : match.ae_consent;
  const companyConsent: Consent =
    match.company_consent === "pending" ? "explicit" : match.company_consent;

  const { data: updated } = await supabaseAdmin
    .from("matches")
    .update({
      status: "resolved",
      conversation_id: conversation.id,
      resolved_at: new Date().toISOString(),
      ae_consent: aeConsent,
      company_consent: companyConsent,
    })
    .eq("id", match.id)
    .select("*")
    .maybeSingle();
  const resolved = (updated as MatchRow | null) ?? {
    ...match,
    status: "resolved",
    conversation_id: conversation.id,
  };

  // notify both sides that the match resolved — a conversation is open.
  await notify(match.candidate_id, "match_resolved", {
    match_id: match.id,
    company_id: match.company_id,
    conversation_id: conversation.id,
  });
  for (const memberId of await companyMemberIds(match.company_id)) {
    await notify(memberId, "match_resolved", {
      match_id: match.id,
      candidate_id: match.candidate_id,
      conversation_id: conversation.id,
    });
  }
  return resolved;
}

/**
 * The consent engine's entrypoint. Given an interest action — an AE expressing
 * interest in a company, or a company expressing interest in an AE — evaluate
 * BOTH sides' consent per the directive's model and either resolve the match
 * or record it pending.
 *
 * IDEMPOTENT: if a match for the (company, candidate, job) triple already
 * exists, this never inserts a second. If it already resolved, it is returned
 * untouched. If it is pending and the new action satisfies the missing side,
 * it resolves it.
 *
 * @param origin       which side initiated this action
 * @param companyId    the company
 * @param candidateId  the AE
 * @param jobId        an optional posting this match is tied to (null = general)
 * @param actorUserId  the user who performed the action — the conversation's
 *                     created_by, and the actor on notifications
 */
export async function runConsentEngine(args: {
  origin: MatchOrigin;
  companyId: string;
  candidateId: string;
  jobId?: string | null;
  actorUserId: string;
}): Promise<ResolveResult> {
  const { origin, companyId, candidateId, actorUserId } = args;
  const jobId = args.jobId ?? null;

  // ── idempotency: an existing match short-circuits the insert ────────────
  const existing = await findMatch(companyId, candidateId, jobId);

  // ── evaluate both sides' consent per the directive's model ──────────────
  // AE-initiated  : AE consent = explicit (they acted). Company consent =
  //                 standing iff the AE satisfies the company's criteria.
  // Company-init  : Company consent = explicit (they acted). AE consent =
  //                 standing iff auto_match=true AND the company satisfies
  //                 the AE's own declared criteria.
  let aeConsent: Consent;
  let companyConsent: Consent;

  if (origin === "ae_initiated") {
    aeConsent = "explicit";
    const candidateFacts = await loadCandidateFacts(candidateId);
    const criteria = await loadCompanyCriteria(companyId);
    // no criteria row at all ⇒ no constraint ⇒ standing consent.
    const companyStanding =
      criteria === null ||
      (candidateFacts !== null && aeSatisfiesCompanyCriteria(candidateFacts, criteria));
    companyConsent = companyStanding ? "standing" : "pending";
  } else {
    companyConsent = "explicit";
    const ae = await loadAeIntent(candidateId);
    const companyFacts = await loadCompanyFacts(companyId);
    // AE standing consent requires auto_match ON *and* the company satisfying
    // the AE's own declared criteria. No intent row ⇒ auto_match is off by
    // default ⇒ pending.
    const aeStanding =
      ae !== null &&
      ae.auto_match === true &&
      companyFacts !== null &&
      companySatisfiesAeCriteria(companyFacts, ae);
    aeConsent = aeStanding ? "standing" : "pending";
  }

  const bothConsented = aeConsent !== "pending" && companyConsent !== "pending";
  const status: MatchStatus = bothConsented
    ? "resolved"
    : aeConsent === "pending"
      ? "pending_ae"
      : "pending_company";

  // ── upsert the match row ────────────────────────────────────────────────
  let match: MatchRow;
  if (existing) {
    // a match already exists. If it is resolved/declined, leave it. If it is
    // pending, re-evaluate: this new action may have satisfied the open side.
    if (existing.status === "resolved" || existing.status === "declined") {
      match = existing;
    } else {
      // merge the freshly-evaluated consents onto the existing row — the new
      // action can only ever GRANT consent, never revoke it.
      const mergedAe: Consent =
        existing.ae_consent !== "pending" ? existing.ae_consent : aeConsent;
      const mergedCompany: Consent =
        existing.company_consent !== "pending" ? existing.company_consent : companyConsent;
      const merged = mergedAe !== "pending" && mergedCompany !== "pending";
      const { data: updated } = await supabaseAdmin
        .from("matches")
        .update({
          ae_consent: mergedAe,
          company_consent: mergedCompany,
          status: merged
            ? "resolved"
            : mergedAe === "pending"
              ? "pending_ae"
              : "pending_company",
        })
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();
      match = (updated as MatchRow | null) ?? existing;
    }
  } else {
    const { data: inserted, error } = await supabaseAdmin
      .from("matches")
      .insert({
        company_id: companyId,
        candidate_id: candidateId,
        job_id: jobId,
        origin,
        ae_consent: aeConsent,
        company_consent: companyConsent,
        status,
      })
      .select("*")
      .maybeSingle();
    if (error || !inserted) {
      // lost the UNIQUE race against a concurrent identical action — recover
      // the row that won and treat this call as idempotent.
      const raced = await findMatch(companyId, candidateId, jobId);
      if (!raced) throw new Error(`consent engine: could not insert or recover match: ${error?.message}`);
      match = raced;
    } else {
      match = inserted as MatchRow;
    }
  }

  // ── resolve or notify ───────────────────────────────────────────────────
  if (match.status === "resolved") {
    const resolved = await resolveMatch(match, actorUserId);
    return { match: resolved, resolvedNow: !existing || existing.status !== "resolved", alreadyExisted: Boolean(existing) };
  }

  // pending — notify the side that must act, unless we already had this exact
  // pending row (a duplicate action should not re-spam the notification).
  const isNewPending = !existing;
  if (isNewPending) {
    if (match.status === "pending_ae") {
      // the AE must explicitly accept — the one surviving manual approval.
      await notify(candidateId, "match_pending", {
        match_id: match.id,
        company_id: companyId,
      });
    } else {
      // pending_company — the company's inbound-interest surface gets a prompt.
      for (const memberId of await companyMemberIds(companyId)) {
        await notify(memberId, "match_pending", {
          match_id: match.id,
          candidate_id: candidateId,
        });
      }
    }
  }
  return { match, resolvedNow: false, alreadyExisted: Boolean(existing) };
}

/**
 * Apply an explicit accept/decline to a pending match — the explicit-consent
 * action. `accept` grants the acting side's consent; if that resolves the
 * match (the other side already consented), the conversation opens. `decline`
 * flips the match to declined. Idempotent on an already-terminal match.
 *
 * @param side which side is acting ('ae' on /me, 'company' on the company surface)
 */
export async function applyMatchDecision(args: {
  matchId: string;
  side: "ae" | "company";
  decision: "accept" | "decline";
  actorUserId: string;
}): Promise<MatchRow | null> {
  const { matchId, side, decision, actorUserId } = args;
  const { data } = await supabaseAdmin
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();
  const match = (data as MatchRow | null) ?? null;
  if (!match) return null;

  // terminal already — idempotent no-op.
  if (match.status === "resolved" || match.status === "declined" || match.status === "expired") {
    return match;
  }

  if (decision === "decline") {
    const { data: declined } = await supabaseAdmin
      .from("matches")
      .update({ status: "declined" })
      .eq("id", matchId)
      .select("*")
      .maybeSingle();
    return (declined as MatchRow | null) ?? match;
  }

  // accept — grant the acting side's explicit consent.
  const aeConsent: Consent = side === "ae" ? "explicit" : match.ae_consent;
  const companyConsent: Consent = side === "company" ? "explicit" : match.company_consent;
  const bothConsented = aeConsent !== "pending" && companyConsent !== "pending";

  if (bothConsented) {
    // persist the consent grant, then resolve (opens the conversation).
    const { data: granted } = await supabaseAdmin
      .from("matches")
      .update({ ae_consent: aeConsent, company_consent: companyConsent })
      .eq("id", matchId)
      .select("*")
      .maybeSingle();
    const updatedMatch = (granted as MatchRow | null) ?? {
      ...match,
      ae_consent: aeConsent,
      company_consent: companyConsent,
    };
    return await resolveMatch(updatedMatch, actorUserId);
  }

  // accept did not resolve it (the other side is still pending) — just record
  // the consent grant and keep the appropriate pending status.
  const { data: granted } = await supabaseAdmin
    .from("matches")
    .update({
      ae_consent: aeConsent,
      company_consent: companyConsent,
      status: aeConsent === "pending" ? "pending_ae" : "pending_company",
    })
    .eq("id", matchId)
    .select("*")
    .maybeSingle();
  return (granted as MatchRow | null) ?? match;
}
