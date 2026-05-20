import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import {
  conversationCreateSchema,
  messageCreateSchema,
  messageHistoryQuerySchema,
} from "@ae-hq/shared";
import { supabaseAdmin } from "../db";
import type { Variables } from "../middleware";
import { resolveParty, resolveRecipients } from "../party";
import { publishToUser, subscribe } from "../messaging-bus";

type ConversationRow = {
  id: string;
  candidate_id: string;
  company_id: string;
  created_by: string;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
};

// Build the "other party" display block for a conversation, from the viewer's
// perspective. Candidate viewers see the company; company viewers see the AE.
async function buildParty(
  conv: ConversationRow,
  viewer: "candidate" | "company",
): Promise<{
  viewer_role: "candidate" | "company";
  display_name: string;
  subtitle: string | null;
  logo_url: string | null;
}> {
  if (viewer === "candidate") {
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name, hq_location, logo_url")
      .eq("id", conv.company_id)
      .maybeSingle();
    return {
      viewer_role: "candidate",
      display_name: company?.name ?? "Company",
      subtitle: company?.hq_location ?? null,
      logo_url: company?.logo_url ?? null,
    };
  }
  // company viewer — show the candidate
  const { data: cand } = await supabaseAdmin
    .from("candidates")
    .select("headline, profiles!inner(name)")
    .eq("user_id", conv.candidate_id)
    .maybeSingle();
  const typed = cand as unknown as { headline: string | null; profiles: { name: string } } | null;
  return {
    viewer_role: "company",
    display_name: typed?.profiles.name ?? "Candidate",
    subtitle: typed?.headline ?? null,
    logo_url: null,
  };
}

export const conversationsRoutes = new Hono<{ Variables: Variables }>()
  // GET /api/v1/conversations — caller's conversations, newest activity first
  .get("/", async (c) => {
    const userId = c.get("userId");
    const party = await resolveParty(userId);
    if (!party) return c.json({ error: { code: "forbidden", message: "no party identity" } }, 403);

    let qb = supabaseAdmin.from("conversations").select("*");
    qb =
      party.kind === "candidate"
        ? qb.eq("candidate_id", party.candidateId)
        : qb.eq("company_id", party.companyId);
    const { data, error } = await qb.order("last_message_at", {
      ascending: false,
      nullsFirst: false,
    });
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);

    const conversations = await Promise.all(
      (data ?? []).map(async (conv) => {
        const party2 = await buildParty(conv as ConversationRow, party.kind);
        // unread = messages addressed to the viewer (not sent by them) with no read_at
        const { count } = await supabaseAdmin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .is("read_at", null)
          .neq("sender_user_id", userId);
        return { ...conv, party: party2, unread_count: count ?? 0 };
      }),
    );
    return c.json({ conversations });
  })
  // POST /api/v1/conversations — explicit create (idempotent on candidate_id+company_id)
  .post("/", zValidator("json", conversationCreateSchema), async (c) => {
    const userId = c.get("userId");
    const party = await resolveParty(userId);
    if (party?.kind !== "company") {
      return c.json({ error: { code: "forbidden", message: "only companies start threads" } }, 403);
    }
    const { candidate_id } = c.req.valid("json");
    const conv = await ensureConversation(party.companyId, candidate_id, userId);
    if (!conv) return c.json({ error: { code: "db_error", message: "could not create conversation" } }, 500);
    return c.json({ conversation: conv });
  })
  // GET /api/v1/conversations/stream — SSE: new-message events across all caller's threads
  // NOTE: registered before /:id so "stream" is not captured as an :id param.
  .get("/stream", (c) => {
    const userId = c.get("userId");
    c.header("Cache-Control", "no-cache, no-transform");
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: "ready", data: JSON.stringify({ user_id: userId }) });

      // Subscribe ONE listener on the shared bus for this user. The listener
      // pushes any queued message events; the writer loop below drains them.
      // validator prediction #1: every subscribe() MUST be paired with the
      // unsubscribe in onAbort or listeners leak on reconnect.
      const queue: string[] = [];
      const unsubscribe = subscribe(userId, (event) => {
        queue.push(JSON.stringify(event));
      });

      let closed = false;
      stream.onAbort(() => {
        closed = true;
        unsubscribe();
      });

      while (!closed) {
        while (queue.length > 0) {
          const payload = queue.shift();
          if (payload) await stream.writeSSE({ event: "message", data: payload });
        }
        // heartbeat keeps proxies + the client alive between messages
        await stream.writeSSE({ event: "ping", data: String(Date.now()) });
        await stream.sleep(1000);
      }
      unsubscribe();
    });
  })
  // GET /api/v1/conversations/:id — one conversation + the other party's info
  .get("/:id", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const party = await resolveParty(userId);
    if (!party) return c.json({ error: { code: "forbidden", message: "no party identity" } }, 403);
    const { data: conv, error } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    if (!conv || !callerInConversation(party, conv as ConversationRow)) {
      return c.json({ error: { code: "not_found", message: "conversation not found" } }, 404);
    }
    const partyInfo = await buildParty(conv as ConversationRow, party.kind);
    return c.json({ conversation: { ...conv, party: partyInfo } });
  })
  // GET /api/v1/conversations/:id/messages — paginated history (ascending)
  .get("/:id/messages", zValidator("query", messageHistoryQuerySchema), async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const q = c.req.valid("query");
    const party = await resolveParty(userId);
    if (!party) return c.json({ error: { code: "forbidden", message: "no party identity" } }, 403);
    const conv = await loadAuthorizedConversation(party, id);
    if (!conv) return c.json({ error: { code: "not_found", message: "conversation not found" } }, 404);

    let qb = supabaseAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(q.limit);
    if (q.before) qb = qb.lt("created_at", q.before);
    const { data, error } = await qb;
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({ messages: data ?? [] });
  })
  // POST /api/v1/conversations/:id/messages — send a message
  .post("/:id/messages", zValidator("json", messageCreateSchema), async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const { body } = c.req.valid("json");
    const party = await resolveParty(userId);
    if (!party) return c.json({ error: { code: "forbidden", message: "no party identity" } }, 403);
    const conv = await loadAuthorizedConversation(party, id);
    if (!conv) return c.json({ error: { code: "not_found", message: "conversation not found" } }, 404);

    // 1. write the message
    const { data: message, error } = await supabaseAdmin
      .from("messages")
      .insert({ conversation_id: id, sender_user_id: userId, body })
      .select("*")
      .single();
    if (error || !message) {
      return c.json({ error: { code: "db_error", message: error?.message ?? "insert failed" } }, 500);
    }

    // 2. update the conversation's last-message denormalized fields
    await supabaseAdmin
      .from("conversations")
      .update({
        last_message_at: message.created_at,
        last_message_preview: body.slice(0, 140),
      })
      .eq("id", id);

    // 3. if this conversation is linked to a pipeline candidate, log activity
    const { data: pc } = await supabaseAdmin
      .from("pipeline_candidates")
      .select("id")
      .eq("conversation_id", id)
      .maybeSingle();
    if (pc) {
      await supabaseAdmin.from("pipeline_activity").insert({
        pipeline_candidate_id: pc.id,
        actor_user_id: userId,
        kind: "message_sent",
        payload_json: { message_id: message.id },
      });
      await supabaseAdmin
        .from("pipeline_candidates")
        .update({ last_activity_at: message.created_at })
        .eq("id", pc.id);
    }

    // 4. emit the SSE event to the recipient's channel(s)
    const recipients = await resolveRecipients(conv, userId);
    for (const recipientId of recipients) {
      publishToUser(recipientId, { conversation_id: id, message });
    }

    return c.json({ message });
  })
  // POST /api/v1/conversations/:id/read — mark messages read up to now
  .post("/:id/read", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const party = await resolveParty(userId);
    if (!party) return c.json({ error: { code: "forbidden", message: "no party identity" } }, 403);
    const conv = await loadAuthorizedConversation(party, id);
    if (!conv) return c.json({ error: { code: "not_found", message: "conversation not found" } }, 404);
    // mark every inbound (not-mine) unread message as read
    const { error } = await supabaseAdmin
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", id)
      .is("read_at", null)
      .neq("sender_user_id", userId);
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    return c.json({ ok: true as const });
  });

// ─────────────── helpers ───────────────

function callerInConversation(
  party: NonNullable<Awaited<ReturnType<typeof resolveParty>>>,
  conv: ConversationRow,
): boolean {
  return party.kind === "candidate"
    ? conv.candidate_id === party.candidateId
    : conv.company_id === party.companyId;
}

// Load a conversation and assert the caller participates in it.
async function loadAuthorizedConversation(
  party: NonNullable<Awaited<ReturnType<typeof resolveParty>>>,
  conversationId: string,
): Promise<ConversationRow | null> {
  const { data } = await supabaseAdmin
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  if (!data) return null;
  const conv = data as ConversationRow;
  return callerInConversation(party, conv) ? conv : null;
}

// Idempotent conversation create — UNIQUE(candidate_id, company_id) makes the
// upsert safe to retry (validator prediction #2 on the unlock-accept flow).
export async function ensureConversation(
  companyId: string,
  candidateId: string,
  createdBy: string,
): Promise<ConversationRow | null> {
  const { data: existing } = await supabaseAdmin
    .from("conversations")
    .select("*")
    .eq("company_id", companyId)
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (existing) return existing as ConversationRow;
  const { data: created } = await supabaseAdmin
    .from("conversations")
    .insert({ company_id: companyId, candidate_id: candidateId, created_by: createdBy, status: "active" })
    .select("*")
    .maybeSingle();
  return (created as ConversationRow) ?? null;
}
