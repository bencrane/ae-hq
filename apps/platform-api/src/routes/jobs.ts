import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { jobSearchQuerySchema } from "@ae-hq/shared";
import { supabaseAdmin } from "../db";
import type { Variables } from "../middleware";

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
    qb = qb.order("posted_at", { ascending: false }).range(q.offset, q.offset + q.limit - 1);
    const { data, error, count } = await qb;
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({
      jobs: (data ?? []).map((row) => {
        const { companies, ...job } = row as Record<string, unknown> & { companies: unknown };
        return { ...job, company: companies };
      }),
      total: count ?? 0,
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
