import { Hono } from "hono";
import { supabaseAdmin } from "../db";
import type { Variables } from "../middleware";

export const meRoutes = new Hono<{ Variables: Variables }>().get("/", async (c) => {
  const userId = c.get("userId");
  // Defense-in-depth: scope to user_id
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
  if (!profile) {
    return c.json({ error: { code: "profile_missing", message: "complete signup first" } }, 404);
  }
  let candidateId: string | null = null;
  if (profile.kind === "candidate") {
    const { data: cand } = await supabaseAdmin
      .from("candidates")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    candidateId = cand?.user_id ?? null;
  }
  let companyId: string | null = null;
  let companyRole: "admin" | "recruiter" | "member" | null = null;
  if (profile.kind === "company_member") {
    const { data: mem } = await supabaseAdmin
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", userId)
      .maybeSingle();
    companyId = mem?.company_id ?? null;
    companyRole = (mem?.role as "admin" | "recruiter" | "member" | null) ?? null;
  }
  return c.json({
    profile,
    candidate_id: candidateId,
    company_id: companyId,
    company_role: companyRole,
  });
});
