import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { jobSearchQuerySchema } from "@ae-hq/shared";
import { supabaseAdmin } from "../db";
import { verifyJwt } from "../auth";
import type { Variables } from "../middleware";

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
  });
