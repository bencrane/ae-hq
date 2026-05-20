/**
 * company-jobs — the company-side per-job surfaces (cycle 5, items #6, #7).
 *
 * Mounted under `/api/v1/company`:
 *   GET  /jobs                                     — aggregate dashboard:
 *        every posting with an applicant count + funnel summary
 *   GET  /jobs/:id/pipeline                        — one job's applications
 *        grouped by the company's pipeline stages
 *   POST /jobs/:id/applications/:applicationId/move — move an application
 *        between stages; writes a pipeline_activity row keyed on application_id
 *
 * Every route is authenticated (mounted under the authed builder) and scoped to
 * the recruiter's company. The per-job board reads `applications` — NOT
 * `pipeline_candidates` (the cycle-3 company-wide table). Activity rows written
 * here key on `application_id`, leaving `pipeline_candidate_id` null (the
 * dual-FK model from migration 0004).
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { applicationMoveSchema } from "@ae-hq/shared";
import { supabaseAdmin } from "../db";
import type { Variables } from "../middleware";

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

type StageRow = { id: string; name: string; position: number; color: string; is_terminal: boolean };

export const companyJobsRoutes = new Hono<{ Variables: Variables }>()
  // GET /api/v1/company/jobs — every posting with applicant count + funnel.
  .get("/jobs", async (c) => {
    const userId = c.get("userId");
    const companyId = await loadCompanyId(userId);
    if (!companyId) {
      return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
    }

    // the company's stage set — the funnel summary is keyed on these.
    const { data: stages, error: sErr } = await supabaseAdmin
      .from("pipeline_stages")
      .select("id, name, position, color, is_terminal")
      .eq("company_id", companyId)
      .order("position", { ascending: true });
    if (sErr) return c.json({ error: { code: "db_error", message: sErr.message } }, 500);
    const stageList = (stages ?? []) as StageRow[];

    // the company's postings.
    const { data: jobs, error: jErr } = await supabaseAdmin
      .from("jobs")
      .select("id, title, segment, location, is_remote, posted_at")
      .eq("company_id", companyId)
      .order("posted_at", { ascending: false });
    if (jErr) return c.json({ error: { code: "db_error", message: jErr.message } }, 500);
    const jobList = (jobs ?? []) as {
      id: string;
      title: string;
      segment: string;
      location: string;
      is_remote: boolean;
      posted_at: string;
    }[];

    // all applications for this company's postings, in one query.
    const jobIds = jobList.map((j) => j.id);
    const appsByJobStage = new Map<string, Map<string, number>>();
    if (jobIds.length > 0) {
      const { data: apps, error: aErr } = await supabaseAdmin
        .from("applications")
        .select("job_id, stage_id")
        .in("job_id", jobIds);
      if (aErr) return c.json({ error: { code: "db_error", message: aErr.message } }, 500);
      for (const a of (apps ?? []) as { job_id: string; stage_id: string }[]) {
        const perStage = appsByJobStage.get(a.job_id) ?? new Map<string, number>();
        perStage.set(a.stage_id, (perStage.get(a.stage_id) ?? 0) + 1);
        appsByJobStage.set(a.job_id, perStage);
      }
    }

    const rows = jobList.map((job) => {
      const perStage = appsByJobStage.get(job.id) ?? new Map<string, number>();
      const funnel = stageList.map((s) => ({
        stage_id: s.id,
        stage_name: s.name,
        color: s.color,
        count: perStage.get(s.id) ?? 0,
      }));
      const applicantCount = funnel.reduce((sum, f) => sum + f.count, 0);
      return { ...job, applicant_count: applicantCount, funnel };
    });

    return c.json({ jobs: rows });
  })
  // GET /api/v1/company/jobs/:id/pipeline — one job's applications grouped by
  // stage (the per-job kanban data).
  .get("/jobs/:id/pipeline", async (c) => {
    const userId = c.get("userId");
    const companyId = await loadCompanyId(userId);
    if (!companyId) {
      return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
    }
    const jobId = c.req.param("id");

    // the job must belong to the recruiter's company.
    const { data: job } = await supabaseAdmin
      .from("jobs")
      .select("id, title, company_id")
      .eq("id", jobId)
      .maybeSingle();
    if (!job || job.company_id !== companyId) {
      return c.json({ error: { code: "not_found", message: "job not found" } }, 404);
    }

    const { data: stages, error: sErr } = await supabaseAdmin
      .from("pipeline_stages")
      .select("id, name, position, color, is_terminal")
      .eq("company_id", companyId)
      .order("position", { ascending: true });
    if (sErr) return c.json({ error: { code: "db_error", message: sErr.message } }, 500);

    const { data: apps, error: aErr } = await supabaseAdmin
      .from("applications")
      .select(
        "*, candidates!inner(headline, segment_focus, profiles!inner(name), " +
          "ae_work_history(start_date, end_date))",
      )
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    if (aErr) return c.json({ error: { code: "db_error", message: aErr.message } }, 500);

    type AppRow = Record<string, unknown> & {
      candidates: {
        headline: string | null;
        segment_focus: string | null;
        profiles: { name: string };
        ae_work_history: WorkHistoryRow[];
      };
    };
    const cards = ((apps ?? []) as unknown as AppRow[]).map((a) => {
      const { candidates: cand, ...rest } = a;
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

    return c.json({
      job: { id: job.id, title: job.title },
      stages: stages ?? [],
      applications: cards,
    });
  })
  // POST /api/v1/company/jobs/:id/applications/:applicationId/move — move an
  // application to another stage; persists stage_id + writes pipeline_activity.
  .post(
    "/jobs/:id/applications/:applicationId/move",
    zValidator("json", applicationMoveSchema),
    async (c) => {
      const userId = c.get("userId");
      const companyId = await loadCompanyId(userId);
      if (!companyId) {
        return c.json({ error: { code: "forbidden", message: "no company membership" } }, 403);
      }
      const jobId = c.req.param("id");
      const applicationId = c.req.param("applicationId");
      const { stage_id } = c.req.valid("json");

      // the job must belong to the recruiter's company.
      const { data: job } = await supabaseAdmin
        .from("jobs")
        .select("id, company_id")
        .eq("id", jobId)
        .maybeSingle();
      if (!job || job.company_id !== companyId) {
        return c.json({ error: { code: "not_found", message: "job not found" } }, 404);
      }

      // the application must belong to this job.
      const { data: app } = await supabaseAdmin
        .from("applications")
        .select("id, stage_id, job_id")
        .eq("id", applicationId)
        .maybeSingle();
      if (!app || app.job_id !== jobId) {
        return c.json(
          { error: { code: "not_found", message: "application not found for job" } },
          404,
        );
      }

      // the destination stage must belong to this company.
      const { data: destStage } = await supabaseAdmin
        .from("pipeline_stages")
        .select("id")
        .eq("id", stage_id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!destStage) {
        return c.json(
          { error: { code: "bad_request", message: "stage not found for company" } },
          400,
        );
      }

      const fromStageId = app.stage_id;
      const { data: updated, error } = await supabaseAdmin
        .from("applications")
        .update({ stage_id, updated_at: new Date().toISOString() })
        .eq("id", app.id)
        .select("*")
        .single();
      if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);

      // write the stage_changed activity row — keyed on application_id, with
      // pipeline_candidate_id left null (the dual-FK model from 0004).
      await supabaseAdmin.from("pipeline_activity").insert({
        application_id: app.id,
        actor_user_id: userId,
        kind: "stage_changed",
        payload_json: { from_stage_id: fromStageId, to_stage_id: stage_id },
      });

      return c.json({ application: updated });
    },
  );
