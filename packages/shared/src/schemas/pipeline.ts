import { z } from "zod";

// ─────────────── pipeline stages ───────────────

// color is a token name — kept loose (text) to mirror the DB column.
export const pipelineStageSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  name: z.string(),
  position: z.number().int(),
  color: z.string(),
  is_terminal: z.boolean(),
  created_at: z.string(),
});
export type PipelineStage = z.infer<typeof pipelineStageSchema>;

// ─────────────── pipeline candidates ───────────────

export const pipelineCandidateSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  candidate_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  conversation_id: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  added_by: z.string().uuid(),
  last_activity_at: z.string(),
  created_at: z.string(),
});
export type PipelineCandidate = z.infer<typeof pipelineCandidateSchema>;

// Card-shaped candidate — anonymized display info joined in for the kanban.
export const pipelineCandidateCardSchema = pipelineCandidateSchema.extend({
  display: z.object({
    initials: z.string(),
    headline: z.string().nullable(),
    segment_focus: z.string().nullable(),
    years_experience: z.number().int(),
  }),
});
export type PipelineCandidateCard = z.infer<typeof pipelineCandidateCardSchema>;

// ─────────────── pipeline activity ───────────────

export const pipelineActivityKindSchema = z.enum([
  "added_to_pipeline",
  "stage_changed",
  "note_added",
  "message_sent",
  "unlocked",
]);
export type PipelineActivityKind = z.infer<typeof pipelineActivityKindSchema>;

export const pipelineActivitySchema = z.object({
  id: z.string().uuid(),
  pipeline_candidate_id: z.string().uuid(),
  actor_user_id: z.string().uuid().nullable(),
  kind: pipelineActivityKindSchema,
  payload_json: z.record(z.unknown()),
  created_at: z.string(),
});
export type PipelineActivity = z.infer<typeof pipelineActivitySchema>;

// ─────────────── request bodies ───────────────

export const pipelineStageCreateSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().max(40).default("default"),
  is_terminal: z.boolean().default(false),
});
export type PipelineStageCreate = z.infer<typeof pipelineStageCreateSchema>;

export const pipelineStagePatchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().max(40).optional(),
  position: z.number().int().min(0).optional(),
  is_terminal: z.boolean().optional(),
});
export type PipelineStagePatch = z.infer<typeof pipelineStagePatchSchema>;

export const pipelineMoveSchema = z.object({
  stage_id: z.string().uuid(),
});
export type PipelineMove = z.infer<typeof pipelineMoveSchema>;

export const pipelineNoteSchema = z.object({
  note: z.string().min(1).max(2000),
});
export type PipelineNote = z.infer<typeof pipelineNoteSchema>;
