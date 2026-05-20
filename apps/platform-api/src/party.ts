/**
 * Resolves the caller's "party" identity for messaging + pipeline routes.
 *
 * A caller is either:
 *   - a candidate  — identified by `candidates.user_id`
 *   - a company member — identified by their `company_members.company_id`
 *
 * Both messaging and pipeline endpoints need this disambiguation, so it lives
 * in one helper rather than being re-implemented per route.
 */

import { supabaseAdmin } from "./db";

export type Party =
  | { kind: "candidate"; userId: string; candidateId: string }
  | { kind: "company"; userId: string; companyId: string };

/** Resolve the caller's party from their JWT-derived user_id, or null if neither. */
export async function resolveParty(userId: string): Promise<Party | null> {
  const { data: cand } = await supabaseAdmin
    .from("candidates")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (cand) return { kind: "candidate", userId, candidateId: cand.user_id };

  const { data: mem } = await supabaseAdmin
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (mem) return { kind: "company", userId, companyId: mem.company_id };

  return null;
}

/**
 * Resolve the recipient user_id(s) for a message in a conversation.
 *
 * cycle-3 treats the company side as a single inbox, so when the sender is the
 * candidate the recipients are the company's member(s); when the sender is the
 * company, the recipient is the candidate.
 */
export async function resolveRecipients(
  conversation: { candidate_id: string; company_id: string },
  senderUserId: string,
): Promise<string[]> {
  if (senderUserId === conversation.candidate_id) {
    // candidate sent it -> recipients are the company's members
    const { data: members } = await supabaseAdmin
      .from("company_members")
      .select("user_id")
      .eq("company_id", conversation.company_id);
    return (members ?? []).map((m) => m.user_id);
  }
  // company member sent it -> recipient is the candidate
  return [conversation.candidate_id];
}
