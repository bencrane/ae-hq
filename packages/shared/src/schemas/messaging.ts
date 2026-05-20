import { z } from "zod";

// ─────────────── conversations ───────────────

export const conversationStatusSchema = z.enum(["active", "archived"]);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

export const conversationSchema = z.object({
  id: z.string().uuid(),
  candidate_id: z.string().uuid(),
  company_id: z.string().uuid(),
  created_by: z.string().uuid(),
  status: conversationStatusSchema,
  last_message_at: z.string().nullable(),
  last_message_preview: z.string().nullable(),
  created_at: z.string(),
});
export type Conversation = z.infer<typeof conversationSchema>;

// The other party's display info — shape returned alongside a conversation.
export const conversationPartySchema = z.object({
  /** The viewer's own role in this thread. */
  viewer_role: z.enum(["candidate", "company"]),
  /** Display name of the OTHER party. */
  display_name: z.string(),
  /** Secondary line (company HQ, candidate headline, etc.). */
  subtitle: z.string().nullable(),
  logo_url: z.string().nullable(),
});
export type ConversationParty = z.infer<typeof conversationPartySchema>;

export const conversationListItemSchema = conversationSchema.extend({
  party: conversationPartySchema,
  unread_count: z.number().int().min(0),
});
export type ConversationListItem = z.infer<typeof conversationListItemSchema>;

// ─────────────── messages ───────────────

export const messageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  sender_user_id: z.string().uuid(),
  body: z.string(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});
export type Message = z.infer<typeof messageSchema>;

// ─────────────── request bodies ───────────────

export const messageCreateSchema = z.object({
  body: z.string().min(1).max(4000),
});
export type MessageCreate = z.infer<typeof messageCreateSchema>;

export const conversationCreateSchema = z.object({
  /** Candidate the company wants to start a thread with. */
  candidate_id: z.string().uuid(),
});
export type ConversationCreate = z.infer<typeof conversationCreateSchema>;

export const messageHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().optional(),
});
