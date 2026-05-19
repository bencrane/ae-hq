import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  candidateOnboardSchema,
  candidatePatchSchema,
  workHistoryCreateSchema,
  workHistoryPatchSchema,
  intentSignalPutSchema,
} from "@ae-hq/shared";
import { supabaseAdmin } from "../db";
import type { Variables } from "../middleware";

export const candidatesRoutes = new Hono<{ Variables: Variables }>()
  // POST /api/v1/candidates/onboard
  .post("/onboard", zValidator("json", candidateOnboardSchema), async (c) => {
    const userId = c.get("userId");
    const email = c.get("userEmail");
    const body = c.req.valid("json");
    // create profile + candidate + empty intent
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .upsert({ user_id: userId, email, kind: "candidate", name: email.split("@")[0] ?? "Candidate" });
    if (pErr) return c.json({ error: { code: "db_error", message: pErr.message } }, 500);
    const { error: cErr } = await supabaseAdmin.from("candidates").upsert({
      user_id: userId,
      headline: body.headline,
      linkedin_url: body.linkedin_url ?? null,
      segment_focus: body.segment_focus ?? null,
    });
    if (cErr) return c.json({ error: { code: "db_error", message: cErr.message } }, 500);
    const { error: iErr } = await supabaseAdmin
      .from("intent_signals")
      .upsert({ candidate_id: userId, target_stages: [], target_segments: [], target_geos: [], target_companies: [] });
    if (iErr) return c.json({ error: { code: "db_error", message: iErr.message } }, 500);
    return c.json({ ok: true as const, candidate_id: userId });
  })
  // GET /api/v1/candidates/me
  .get("/me", async (c) => {
    const userId = c.get("userId");
    const { data, error } = await supabaseAdmin.from("candidates").select("*").eq("user_id", userId).maybeSingle();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    if (!data) return c.json({ error: { code: "not_found", message: "no candidate profile" } }, 404);
    return c.json({ candidate: data });
  })
  // PATCH /api/v1/candidates/me
  .patch("/me", zValidator("json", candidatePatchSchema), async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const { data, error } = await supabaseAdmin
      .from("candidates")
      .update(body)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({ candidate: data });
  })
  // GET /api/v1/candidates/me/work-history
  .get("/me/work-history", async (c) => {
    const userId = c.get("userId");
    const { data, error } = await supabaseAdmin
      .from("ae_work_history")
      .select("*, companies!inner(id, slug, name, logo_url)")
      .eq("candidate_id", userId)
      .order("start_date", { ascending: false });
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({
      work_history: (data ?? []).map((row) => {
        const { companies, ...rest } = row as Record<string, unknown> & { companies: unknown };
        return { ...rest, company: companies };
      }),
    });
  })
  // POST /api/v1/candidates/me/work-history
  .post("/me/work-history", zValidator("json", workHistoryCreateSchema), async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const { data, error } = await supabaseAdmin
      .from("ae_work_history")
      .insert({ ...body, candidate_id: userId })
      .select("*")
      .single();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({ entry: data });
  })
  // PATCH /api/v1/candidates/me/work-history/:id
  .patch("/me/work-history/:id", zValidator("json", workHistoryPatchSchema), async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const { data, error } = await supabaseAdmin
      .from("ae_work_history")
      .update(body)
      .eq("id", id)
      .eq("candidate_id", userId)
      .select("*")
      .maybeSingle();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    if (!data) return c.json({ error: { code: "not_found", message: "entry not found" } }, 404);
    return c.json({ entry: data });
  })
  // DELETE /api/v1/candidates/me/work-history/:id
  .delete("/me/work-history/:id", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const { error } = await supabaseAdmin
      .from("ae_work_history")
      .delete()
      .eq("id", id)
      .eq("candidate_id", userId);
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({ ok: true as const });
  })
  // GET /api/v1/candidates/me/intent
  .get("/me/intent", async (c) => {
    const userId = c.get("userId");
    const { data, error } = await supabaseAdmin
      .from("intent_signals")
      .select("*")
      .eq("candidate_id", userId)
      .maybeSingle();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({ intent: data });
  })
  // PUT /api/v1/candidates/me/intent
  .put("/me/intent", zValidator("json", intentSignalPutSchema), async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const { data, error } = await supabaseAdmin
      .from("intent_signals")
      .upsert({ candidate_id: userId, ...body, updated_at: new Date().toISOString() })
      .select("*")
      .single();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({ intent: data });
  })
  // GET /api/v1/candidates/me/approvals
  .get("/me/approvals", async (c) => {
    const userId = c.get("userId");
    const { data, error } = await supabaseAdmin
      .from("unlock_requests")
      .select("*, companies!inner(id, slug, name, logo_url)")
      .eq("candidate_id", userId)
      .order("created_at", { ascending: false });
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({
      approvals: (data ?? []).map((row) => {
        const { companies, ...rest } = row as Record<string, unknown> & { companies: unknown };
        return { ...rest, company: companies };
      }),
    });
  })
  // POST /api/v1/candidates/me/approvals/:id/accept
  .post(
    "/me/approvals/:id/accept",
    zValidator("json", z.object({}).optional()),
    async (c) => {
      const userId = c.get("userId");
      const id = c.req.param("id");
      const { data, error } = await supabaseAdmin
        .from("unlock_requests")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("id", id)
        .eq("candidate_id", userId)
        .eq("status", "pending")
        .select("*, companies!inner(id, slug, name)")
        .maybeSingle();
      if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
      if (!data) return c.json({ error: { code: "not_found", message: "approval not found or already responded" } }, 404);
      // notify the recruiter side
      const { data: members } = await supabaseAdmin
        .from("company_members")
        .select("user_id")
        .eq("company_id", data.company_id);
      for (const m of members ?? []) {
        await supabaseAdmin.from("notifications").insert({
          user_id: m.user_id,
          kind: "unlock_accepted",
          payload_json: { candidate_id: userId, unlock_request_id: id },
        });
      }
      return c.json({ approval: data });
    },
  )
  // POST /api/v1/candidates/me/approvals/:id/decline
  .post(
    "/me/approvals/:id/decline",
    zValidator("json", z.object({}).optional()),
    async (c) => {
      const userId = c.get("userId");
      const id = c.req.param("id");
      const { data, error } = await supabaseAdmin
        .from("unlock_requests")
        .update({ status: "declined", responded_at: new Date().toISOString() })
        .eq("id", id)
        .eq("candidate_id", userId)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();
      if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
      if (!data) return c.json({ error: { code: "not_found", message: "approval not found" } }, 404);
      const { data: members } = await supabaseAdmin
        .from("company_members")
        .select("user_id")
        .eq("company_id", data.company_id);
      for (const m of members ?? []) {
        await supabaseAdmin.from("notifications").insert({
          user_id: m.user_id,
          kind: "unlock_declined",
          payload_json: { candidate_id: userId, unlock_request_id: id },
        });
      }
      return c.json({ approval: data });
    },
  );
