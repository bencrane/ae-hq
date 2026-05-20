import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { articleListQuerySchema } from "@ae-hq/shared";
import { supabaseAdmin } from "../db";
import type { Variables } from "../middleware";

// Carrying Quota editorial — seeded, read-only. No write endpoints (the CMS is
// a separate brand + codebase; cycle-3 only surfaces articles here).

export const articlesRoutes = new Hono<{ Variables: Variables }>()
  // GET /api/v1/articles — list, paginated, optional ?kind= filter.
  // The list omits the heavy body_md column.
  .get("/", zValidator("query", articleListQuerySchema), async (c) => {
    const q = c.req.valid("query");
    let qb = supabaseAdmin
      .from("articles")
      .select("id, kind, slug, title, dek, hero_image_url, author_name, read_minutes, tags, published_at", {
        count: "exact",
      });
    if (q.kind) qb = qb.eq("kind", q.kind);
    qb = qb.order("published_at", { ascending: false }).range(q.offset, q.offset + q.limit - 1);
    const { data, error, count } = await qb;
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({ articles: data ?? [], total: count ?? 0 });
  })
  // GET /api/v1/articles/:slug — one article, full body_md included.
  .get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const { data, error } = await supabaseAdmin
      .from("articles")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    if (!data) return c.json({ error: { code: "not_found", message: "article not found" } }, 404);
    return c.json({ article: data });
  });
