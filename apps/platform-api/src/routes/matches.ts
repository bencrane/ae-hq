/**
 * /api/v1/matches — the caller's matches, and the explicit accept/decline.
 *
 * A match is anonymized until it resolves: the `matches` rows here NEVER carry
 * the candidate's real name on a non-resolved row (the company view derives
 * initials; the candidate view shows the company, which is never anonymous).
 * Identity is revealed only after status='resolved'.
 *
 * - GET  /api/v1/matches            — the caller's matches, optionally by status
 * - POST /api/v1/matches/:id/accept — the explicit-consent grant. AE-side it is
 *                                     the one surviving manual approval;
 *                                     company-side it is the inbound-interest
 *                                     accept.
 * - POST /api/v1/matches/:id/decline
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { matchListQuerySchema, matchDecisionSchema } from "@ae-hq/shared";
import { supabaseAdmin } from "../db";
import type { Variables } from "../middleware";
import { resolveParty } from "../party";
import { applyMatchDecision, type MatchRow } from "../consent-engine";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "AE"
  );
}

/**
 * Serialize a match for an API response from the VIEWER's perspective.
 *
 * - Candidate viewer: sees the company (companies are never anonymous).
 * - Company viewer: sees the candidate ANONYMIZED — initials + headline only,
 *   UNLESS the match has resolved, in which case the real name is revealed
 *   (the cycle-1 reveal-on-resolve rule). The candidate's `profiles.name` is
 *   dropped before serialization on every non-resolved row — it never reaches
 *   the JSON (the leak-through-a-join guard).
 */
type MatchJoinRow = MatchRow & {
  companies: { id: string; slug: string; name: string; logo_url: string | null } | null;
  candidates: {
    user_id: string;
    headline: string | null;
    segment_focus: string | null;
    profiles: { name: string } | null;
  } | null;
};

function serializeForCandidate(row: MatchJoinRow) {
  const { companies, candidates, ...match } = row;
  void candidates;
  return { ...match, company: companies };
}

function serializeForCompany(row: MatchJoinRow) {
  const { companies, candidates, ...match } = row;
  void companies;
  const resolved = match.status === "resolved";
  const name = candidates?.profiles?.name ?? "";
  return {
    ...match,
    candidate: candidates
      ? {
          // identity: revealed ONLY once the match resolves.
          id: candidates.user_id,
          initials: initials(name),
          headline: candidates.headline,
          segment_focus: candidates.segment_focus,
          name: resolved ? name : null,
          is_revealed: resolved,
        }
      : null,
  };
}

const MATCH_SELECT =
  "*, companies!inner(id, slug, name, logo_url), " +
  "candidates!inner(user_id, headline, segment_focus, profiles!inner(name))";

export const matchesRoutes = new Hono<{ Variables: Variables }>()
  // GET /api/v1/matches — the caller's matches, newest first, optional ?status.
  .get("/", zValidator("query", matchListQuerySchema), async (c) => {
    const userId = c.get("userId");
    const { status } = c.req.valid("query");
    const party = await resolveParty(userId);
    if (!party) return c.json({ error: { code: "forbidden", message: "no party identity" } }, 403);

    let qb = supabaseAdmin.from("matches").select(MATCH_SELECT);
    qb =
      party.kind === "candidate"
        ? qb.eq("candidate_id", party.candidateId)
        : qb.eq("company_id", party.companyId);
    if (status) qb = qb.eq("status", status);
    const { data, error } = await qb.order("created_at", { ascending: false });
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);

    const rows = (data ?? []) as unknown as MatchJoinRow[];
    const matches =
      party.kind === "candidate"
        ? rows.map(serializeForCandidate)
        : rows.map(serializeForCompany);
    return c.json({ matches });
  })
  // POST /api/v1/matches/:id/accept — the explicit-consent grant.
  .post("/:id/accept", zValidator("json", matchDecisionSchema), async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const party = await resolveParty(userId);
    if (!party) return c.json({ error: { code: "forbidden", message: "no party identity" } }, 403);

    // load + authorize: the caller must be a participant in this match.
    const { data: match } = await supabaseAdmin
      .from("matches")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!match) return c.json({ error: { code: "not_found", message: "match not found" } }, 404);
    const m = match as MatchRow;
    const isParticipant =
      party.kind === "candidate"
        ? m.candidate_id === party.candidateId
        : m.company_id === party.companyId;
    if (!isParticipant) {
      return c.json({ error: { code: "not_found", message: "match not found" } }, 404);
    }

    const updated = await applyMatchDecision({
      matchId: id,
      side: party.kind === "candidate" ? "ae" : "company",
      decision: "accept",
      actorUserId: userId,
    });
    if (!updated) return c.json({ error: { code: "not_found", message: "match not found" } }, 404);
    return c.json({ match: updated });
  })
  // POST /api/v1/matches/:id/decline
  .post("/:id/decline", zValidator("json", matchDecisionSchema), async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const party = await resolveParty(userId);
    if (!party) return c.json({ error: { code: "forbidden", message: "no party identity" } }, 403);

    const { data: match } = await supabaseAdmin
      .from("matches")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!match) return c.json({ error: { code: "not_found", message: "match not found" } }, 404);
    const m = match as MatchRow;
    const isParticipant =
      party.kind === "candidate"
        ? m.candidate_id === party.candidateId
        : m.company_id === party.companyId;
    if (!isParticipant) {
      return c.json({ error: { code: "not_found", message: "match not found" } }, 404);
    }

    const updated = await applyMatchDecision({
      matchId: id,
      side: party.kind === "candidate" ? "ae" : "company",
      decision: "decline",
      actorUserId: userId,
    });
    if (!updated) return c.json({ error: { code: "not_found", message: "match not found" } }, 404);
    return c.json({ match: updated });
  });
