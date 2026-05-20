import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Service-role admin client. RLS bypassed; defense-in-depth WHERE user_id = $auth_uid in every query.
export const supabaseAdmin = createClient(env.AE_SUPABASE_URL, env.AE_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

// Helper: build a query that always scopes to the user's own row.
// Every BFF query MUST go through one of these helpers — see grep gate in cycle-1-criteria.sh.
type UserScopedTable =
  | "profiles"
  | "candidates"
  | "intent_signals"
  | "verified_credentials"
  | "credential_uploads"
  | "ae_work_history"
  | "notifications"
  | "unlock_requests"
  | "company_members";

export function selectMineByUserId(table: UserScopedTable, userId: string) {
  return supabaseAdmin.from(table).select("*").eq(table === "ae_work_history" ? "candidate_id" : table === "intent_signals" ? "candidate_id" : table === "verified_credentials" ? "candidate_id" : table === "credential_uploads" ? "candidate_id" : table === "unlock_requests" ? "candidate_id" : "user_id", userId);
}

export type SupabaseAdmin = typeof supabaseAdmin;
