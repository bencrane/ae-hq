import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  pipelineMoveSchema,
  pipelineNoteSchema,
  pipelineStageCreateSchema,
  pipelineStagePatchSchema,
} from "@ae-hq/shared";
import { supabaseAdmin } from "../db";
import type { Variables } from "../middleware";

// Load the recruiter's company_id from their JWT-derived user_id.
async function loadCompanyId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.company_id ?? null;
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "AE"
  );
}

type WorkHistoryRow = { start_date: string; end_date: string | null };

function yearsExperience(history: WorkHistoryRow[]): number {
  return Math.max(
    1,
    Math.round(
      history.reduce((acc, h) => {
        const start = new Date(h.start_date).getTime();
        const end = h.end_date ? new Date(h.end_date).getTime() : Date.now();
        return acc + (end - start) / (1000 * 60 * 60 * 24 * 365);
      }, 0),
    ),
  );
}

export const pipelineRoutes = new Hono<{ Variables: Variables }>()
  // GET /api/v1/company/pipeline — stages + candidates grouped by stage
  .get("/pipeline", async (c) => {
    const userId = c.get("userId");
    const companyId = await loadCompanyId(userId);
    if (!companyId) {
      return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
    }
    const { data: stages, error: sErr } = await supabaseAdmin
      .from("pipeline_stages")
      .select("*")
      .eq("company_id", companyId)
      .order("position", { ascending: true });
    if (sErr) return c.json({ error: { code: "db_error", message: sErr.message } }, 500);

    const { data: pcs, error: pErr } = await supabaseAdmin
      .from("pipeline_candidates")
      .select(
        "*, candidates!inner(headline, segment_focus, profiles!inner(name), ae_work_history(start_date, end_date))",
      )
      .eq("company_id", companyId)
      .order("last_activity_at", { ascending: false });
    if (pErr) return c.json({ error: { code: "db_error", message: pErr.message } }, 500);

    type CandRow = {
      id: string;
      company_id: string;
      candidate_id: string;
      stage_id: string;
      conversation_id: string | null;
      notes: string | null;
      added_by: string;
      last_activity_at: string;
      created_at: string;
      candidates: {
        headline: string | null;
        segment_focus: string | null;
        profiles: { name: string };
        ae_work_history: WorkHistoryRow[];
      };
    };
    const candidates = ((pcs ?? []) as unknown as CandRow[]).map((pc) => {
      const { candidates: cand, ...rest } = pc;
      return {
        ...rest,
        display: {
          initials: initials(cand.profiles.name),
          headline: cand.headline,
          segment_focus: cand.segment_focus,
          years_experience: yearsExperience(cand.ae_work_history ?? []),
        },
      };
    });
    return c.json({ stages: stages ?? [], candidates });
  })
  // POST /api/v1/company/pipeline/stages — create a stage
  .post("/pipeline/stages", zValidator("json", pipelineStageCreateSchema), async (c) => {
    const userId = c.get("userId");
    const companyId = await loadCompanyId(userId);
    if (!companyId) {
      return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
    }
    const body = c.req.valid("json");
    // append at the end — next position after the current max
    const { data: last } = await supabaseAdmin
      .from("pipeline_stages")
      .select("position")
      .eq("company_id", companyId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = (last?.position ?? -1) + 1;
    const { data, error } = await supabaseAdmin
      .from("pipeline_stages")
      .insert({
        company_id: companyId,
        name: body.name,
        color: body.color,
        is_terminal: body.is_terminal,
        position: nextPosition,
      })
      .select("*")
      .single();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({ stage: data });
  })
  // PATCH /api/v1/company/pipeline/stages/:id — rename / recolor / reorder
  .patch("/pipeline/stages/:id", zValidator("json", pipelineStagePatchSchema), async (c) => {
    const userId = c.get("userId");
    const companyId = await loadCompanyId(userId);
    if (!companyId) {
      return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
    }
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const { data, error } = await supabaseAdmin
      .from("pipeline_stages")
      .update(body)
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    if (!data) return c.json({ error: { code: "not_found", message: "stage not found" } }, 404);
    return c.json({ stage: data });
  })
  // POST /api/v1/company/pipeline/candidates/:candidateId/move — move to a stage
  .post(
    "/pipeline/candidates/:candidateId/move",
    zValidator("json", pipelineMoveSchema),
    async (c) => {
      const userId = c.get("userId");
      const companyId = await loadCompanyId(userId);
      if (!companyId) {
        return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
      }
      const candidateId = c.req.param("candidateId");
      const { stage_id } = c.req.valid("json");

      // load the pipeline candidate (scoped to this company)
      const { data: pc } = await supabaseAdmin
        .from("pipeline_candidates")
        .select("id, stage_id")
        .eq("company_id", companyId)
        .eq("candidate_id", candidateId)
        .maybeSingle();
      if (!pc) {
        return c.json({ error: { code: "not_found", message: "candidate not in pipeline" } }, 404);
      }
      // verify the destination stage belongs to this company
      const { data: destStage } = await supabaseAdmin
        .from("pipeline_stages")
        .select("id")
        .eq("id", stage_id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!destStage) {
        return c.json({ error: { code: "bad_request", message: "stage not found for company" } }, 400);
      }
      const fromStageId = pc.stage_id;
      const movedAt = new Date().toISOString();
      const { data: updated, error } = await supabaseAdmin
        .from("pipeline_candidates")
        .update({ stage_id, last_activity_at: movedAt })
        .eq("id", pc.id)
        .select("*")
        .single();
      if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
      // write the stage_changed activity row
      await supabaseAdmin.from("pipeline_activity").insert({
        pipeline_candidate_id: pc.id,
        actor_user_id: userId,
        kind: "stage_changed",
        payload_json: { from_stage_id: fromStageId, to_stage_id: stage_id },
      });
      return c.json({ pipeline_candidate: updated });
    },
  )
  // POST /api/v1/company/pipeline/candidates/:candidateId/notes — add a note
  .post(
    "/pipeline/candidates/:candidateId/notes",
    zValidator("json", pipelineNoteSchema),
    async (c) => {
      const userId = c.get("userId");
      const companyId = await loadCompanyId(userId);
      if (!companyId) {
        return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
      }
      const candidateId = c.req.param("candidateId");
      const { note } = c.req.valid("json");
      const { data: pc } = await supabaseAdmin
        .from("pipeline_candidates")
        .select("id")
        .eq("company_id", companyId)
        .eq("candidate_id", candidateId)
        .maybeSingle();
      if (!pc) {
        return c.json({ error: { code: "not_found", message: "candidate not in pipeline" } }, 404);
      }
      const now = new Date().toISOString();
      const { data: updated, error } = await supabaseAdmin
        .from("pipeline_candidates")
        .update({ notes: note, last_activity_at: now })
        .eq("id", pc.id)
        .select("*")
        .single();
      if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
      await supabaseAdmin.from("pipeline_activity").insert({
        pipeline_candidate_id: pc.id,
        actor_user_id: userId,
        kind: "note_added",
        payload_json: { note },
      });
      return c.json({ pipeline_candidate: updated });
    },
  )
  // GET /api/v1/company/pipeline/candidates/:candidateId/activity — timeline
  .get(
    "/pipeline/candidates/:candidateId/activity",
    zValidator("query", z.object({}).optional()),
    async (c) => {
      const userId = c.get("userId");
      const companyId = await loadCompanyId(userId);
      if (!companyId) {
        return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
      }
      const candidateId = c.req.param("candidateId");
      const { data: pc } = await supabaseAdmin
        .from("pipeline_candidates")
        .select("id")
        .eq("company_id", companyId)
        .eq("candidate_id", candidateId)
        .maybeSingle();
      if (!pc) {
        return c.json({ error: { code: "not_found", message: "candidate not in pipeline" } }, 404);
      }
      const { data, error } = await supabaseAdmin
        .from("pipeline_activity")
        .select("*")
        .eq("pipeline_candidate_id", pc.id)
        .order("created_at", { ascending: false });
      if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
      return c.json({ activity: data ?? [] });
    },
  );

/**
 * Idempotently place a candidate in a company's pipeline at its FIRST stage,
 * writing an `added_to_pipeline` activity row on first placement. Optionally
 * links a conversation. Used by the unlock-accept side effect.
 *
 * Validator predictions handled here:
 *   #2 — UNIQUE(company_id, candidate_id) makes a retry safe (we check first).
 *   #3 — guards the empty-stages case (a company with no seeded stages must
 *        not throw — it simply gets no pipeline_candidates row).
 */
export async function ensurePipelineCandidate(args: {
  companyId: string;
  candidateId: string;
  addedBy: string;
  conversationId?: string | null;
}): Promise<{ created: boolean; pipelineCandidateId: string | null }> {
  const { companyId, candidateId, addedBy, conversationId } = args;

  // already in the pipeline? — idempotent no-op (just backfill the conversation link)
  const { data: existing } = await supabaseAdmin
    .from("pipeline_candidates")
    .select("id, conversation_id")
    .eq("company_id", companyId)
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (existing) {
    if (conversationId && !existing.conversation_id) {
      await supabaseAdmin
        .from("pipeline_candidates")
        .update({ conversation_id: conversationId })
        .eq("id", existing.id);
    }
    return { created: false, pipelineCandidateId: existing.id };
  }

  // first stage = lowest position. If the company has no stages, do not throw —
  // skip pipeline placement (the conversation still gets created upstream).
  const { data: firstStage } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id")
    .eq("company_id", companyId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!firstStage) {
    return { created: false, pipelineCandidateId: null };
  }

  const { data: created } = await supabaseAdmin
    .from("pipeline_candidates")
    .insert({
      company_id: companyId,
      candidate_id: candidateId,
      stage_id: firstStage.id,
      conversation_id: conversationId ?? null,
      added_by: addedBy,
    })
    .select("id")
    .maybeSingle();
  if (!created) return { created: false, pipelineCandidateId: null };

  await supabaseAdmin.from("pipeline_activity").insert({
    pipeline_candidate_id: created.id,
    actor_user_id: addedBy,
    kind: "added_to_pipeline",
    payload_json: { stage_id: firstStage.id },
  });
  return { created: true, pipelineCandidateId: created.id };
}
