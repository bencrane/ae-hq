import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { applyJobBodySchema, jobSearchQuerySchema } from "@ae-hq/shared";
import { supabaseAdmin } from "../db";
import { verifyJwt } from "../auth";
import type { Variables } from "../middleware";
import { buildJobCollections } from "./job-collections";
import { runConsentEngine } from "../consent-engine";

// `/jobs` lives in the PUBLIC route group — anonymous browse must keep working.
// To support `?for_me=true` the handler optionally reads the JWT when present
// and ignores it when absent. It must NOT be moved under authedV1.
async function optionalUserId(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) return null;
  try {
    const claims = await verifyJwt(m[1]!);
    return claims.sub ?? null;
  } catch {
    return null;
  }
}

export const jobsRoutes = new Hono<{ Variables: Variables }>()
  .get("/", zValidator("query", jobSearchQuerySchema), async (c) => {
    const q = c.req.valid("query");
    let qb = supabaseAdmin
      .from("jobs")
      .select("*, companies!inner(id, slug, name, logo_url, hq_location)", { count: "exact" });
    if (q.segment) qb = qb.eq("segment", q.segment);
    if (q.stage) qb = qb.eq("stage", q.stage);
    if (q.methodology) qb = qb.eq("methodology", q.methodology);
    if (q.is_remote !== undefined) qb = qb.eq("is_remote", q.is_remote);
    if (q.ote_min) qb = qb.gte("ote_max", q.ote_min);
    if (q.q) qb = qb.ilike("title", `%${q.q}%`);

    // `for_me`: intent-filter the feed for an authenticated candidate. This is
    // a plain SQL WHERE on the caller's intent_signals — NOT a ranking algo.
    // Empty intent arrays mean "no constraint" (skip the predicate), never
    // "match nothing" — so a candidate with no declared intent still sees the
    // full feed. Anonymous callers and `for_me` unset are unaffected.
    let forMeApplied = false;
    if (q.for_me) {
      const userId = await optionalUserId(c.req.header("authorization"));
      if (userId) {
        const { data: intent } = await supabaseAdmin
          .from("intent_signals")
          .select("target_segments, target_stages, comp_ote_min")
          .eq("candidate_id", userId)
          .maybeSingle();
        if (intent) {
          const segs = (intent.target_segments ?? []) as string[];
          const stages = (intent.target_stages ?? []) as string[];
          if (segs.length > 0) qb = qb.in("segment", segs);
          if (stages.length > 0) qb = qb.in("stage", stages);
          if (typeof intent.comp_ote_min === "number") {
            qb = qb.gte("ote_max", intent.comp_ote_min);
          }
          forMeApplied = true;
        }
      }
    }

    qb = qb.order("posted_at", { ascending: false }).range(q.offset, q.offset + q.limit - 1);
    const { data, error, count } = await qb;
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({
      jobs: (data ?? []).map((row) => {
        const { companies, ...job } = row as Record<string, unknown> & { companies: unknown };
        return { ...job, company: companies };
      }),
      total: count ?? 0,
      for_me: forMeApplied,
    });
  })
  .get("/search", zValidator("query", jobSearchQuerySchema), async (c) => {
    // alias for /
    const q = c.req.valid("query");
    let qb = supabaseAdmin.from("jobs").select("*, companies!inner(id, slug, name, logo_url, hq_location)");
    if (q.q) qb = qb.ilike("title", `%${q.q}%`);
    qb = qb.order("posted_at", { ascending: false }).limit(q.limit);
    const { data, error } = await qb;
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({
      jobs: (data ?? []).map((row) => {
        const { companies, ...job } = row as Record<string, unknown> & { companies: unknown };
        return { ...job, company: companies };
      }),
    });
  })
  // GET /api/v1/jobs/collections — curated job collections grouped by a
  // firmographic axis (sales_motion, funding stage, investor). Optional bearer
  // token: when a candidate is signed in, each card carries an `applied` flag.
  // Declared BEFORE `/:id` so the literal path is not swallowed by the param.
  .get("/collections", async (c) => {
    const userId = await optionalUserId(c.req.header("authorization"));
    const result = await buildJobCollections(userId);
    if (!result.ok) {
      return c.json({ error: { code: "db_error", message: result.message } }, 500);
    }
    return c.json({ collections: result.collections });
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const { data, error } = await supabaseAdmin
      .from("jobs")
      .select("*, companies!inner(id, slug, name, logo_url, hq_location, description)")
      .eq("id", id)
      .maybeSingle();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    if (!data) return c.json({ error: { code: "not_found", message: "job not found" } }, 404);
    const { companies, ...job } = data as Record<string, unknown> & { companies: unknown };
    return c.json({ job: { ...job, company: companies } });
  })
  // POST /api/v1/jobs/:id/apply — a candidate applies to a specific job.
  // Idempotent: re-applying is a no-op (the existing row is returned 200,
  // `created: false`). Creates an `applications` row at the company's first
  // pipeline stage with source='candidate_applied'. Requires a valid JWT —
  // `jobsRoutes` is in the public group, so auth is enforced inline here.
  .post("/:id/apply", zValidator("json", applyJobBodySchema), async (c) => {
    const candidateId = await optionalUserId(c.req.header("authorization"));
    if (!candidateId) {
      return c.json({ error: { code: "unauthorized", message: "sign in to apply" } }, 401);
    }
    const jobId = c.req.param("id");

    // the job + its company
    const { data: job, error: jErr } = await supabaseAdmin
      .from("jobs")
      .select("id, company_id")
      .eq("id", jobId)
      .maybeSingle();
    if (jErr) return c.json({ error: { code: "db_error", message: jErr.message } }, 500);
    if (!job) return c.json({ error: { code: "not_found", message: "job not found" } }, 404);

    // already applied? — idempotent no-op.
    const { data: existing } = await supabaseAdmin
      .from("applications")
      .select("*")
      .eq("job_id", jobId)
      .eq("candidate_id", candidateId)
      .maybeSingle();
    if (existing) {
      return c.json({ application: existing, created: false });
    }

    // the company's first (lowest-position) pipeline stage.
    const { data: firstStage } = await supabaseAdmin
      .from("pipeline_stages")
      .select("id")
      .eq("company_id", job.company_id)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!firstStage) {
      return c.json(
        { error: { code: "no_stages", message: "the hiring company has no pipeline stages" } },
        409,
      );
    }

    const { data: created, error: cErr } = await supabaseAdmin
      .from("applications")
      .insert({
        job_id: jobId,
        candidate_id: candidateId,
        stage_id: firstStage.id,
        status: "applied",
        source: "candidate_applied",
      })
      .select("*")
      .maybeSingle();
    if (cErr) {
      // a concurrent apply lost the UNIQUE(job_id,candidate_id) race — treat as
      // an idempotent no-op rather than a 500.
      const { data: raced } = await supabaseAdmin
        .from("applications")
        .select("*")
        .eq("job_id", jobId)
        .eq("candidate_id", candidateId)
        .maybeSingle();
      if (raced) return c.json({ application: raced, created: false });
      return c.json({ error: { code: "db_error", message: cErr.message } }, 500);
    }

    // log an added_to_pipeline activity row keyed on application_id.
    if (created) {
      await supabaseAdmin.from("pipeline_activity").insert({
        application_id: created.id,
        actor_user_id: candidateId,
        kind: "added_to_pipeline",
        payload_json: { stage_id: firstStage.id },
      });
      // cycle-6: applying to a job is an AE-initiated interest action toward
      // the hiring company, tied to this posting. Run the consent engine so
      // the apply produces a `matches` row (origin=ae_initiated, job_id set);
      // it resolves if the company's standing consent is granted (the AE
      // satisfies the company's match-criteria). Best-effort — an apply must
      // not fail on a consent-engine error; the row is already created.
      try {
        await runConsentEngine({
          origin: "ae_initiated",
          companyId: job.company_id,
          candidateId,
          jobId: jobId,
          actorUserId: candidateId,
        });
      } catch (e) {
        c.get("log").warn({ err: (e as Error).message }, "apply consent-engine failed");
      }
    }
    return c.json({ application: created, created: true });
  });
