import { Hono } from "hono";
import { supabaseAdmin } from "../db";
import type { Variables } from "../middleware";

export const companiesRoutes = new Hono<{ Variables: Variables }>().get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const { data: company, error } = await supabaseAdmin
    .from("companies")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
  if (!company) return c.json({ error: { code: "not_found", message: "company not found" } }, 404);
  const { data: jobs, count } = await supabaseAdmin
    .from("jobs")
    .select("*", { count: "exact" })
    .eq("company_id", company.id)
    .order("posted_at", { ascending: false });
  return c.json({ company: { ...company, open_jobs: count ?? 0 }, jobs: jobs ?? [] });
});
