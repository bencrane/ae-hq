import { z } from "zod";
import { segmentSchema, methodologySchema } from "./common";

export const candidateSchema = z.object({
  user_id: z.string().uuid(),
  headline: z.string().max(140).nullable(),
  linkedin_url: z.string().url().nullable(),
  segment_focus: segmentSchema.nullable(),
  methodology: z.array(methodologySchema).default([]),
  current_company_id: z.string().uuid().nullable(),
});
export type Candidate = z.infer<typeof candidateSchema>;

export const candidatePatchSchema = candidateSchema
  .pick({ headline: true, linkedin_url: true, segment_focus: true, methodology: true, current_company_id: true })
  .partial();
export type CandidatePatch = z.infer<typeof candidatePatchSchema>;

export const workHistorySchema = z.object({
  id: z.string().uuid(),
  candidate_id: z.string().uuid(),
  company_id: z.string().uuid(),
  title: z.string(),
  segment: segmentSchema.nullable(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  is_current: z.boolean(),
});
export type WorkHistory = z.infer<typeof workHistorySchema>;

export const workHistoryCreateSchema = workHistorySchema.omit({ id: true, candidate_id: true });
export const workHistoryPatchSchema = workHistoryCreateSchema.partial();

export const workHistoryWithCompanySchema = workHistorySchema.extend({
  company: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    logo_url: z.string().url().nullable(),
  }),
});
export type WorkHistoryWithCompany = z.infer<typeof workHistoryWithCompanySchema>;

export const candidateOnboardSchema = z.object({
  headline: z.string().max(140),
  linkedin_url: z.string().url().optional(),
  segment_focus: segmentSchema.optional(),
});

export const anonymizedCandidateSchema = z.object({
  id: z.string().uuid(),
  initials: z.string(),
  headline: z.string().nullable(),
  segment_focus: segmentSchema.nullable(),
  methodology: z.array(methodologySchema),
  years_experience: z.number().int().min(0),
  current_stage_pattern: z.string(),
  worked_at_companies: z.array(
    z.object({ id: z.string().uuid(), name: z.string(), logo_url: z.string().url().nullable() }),
  ),
});
export type AnonymizedCandidate = z.infer<typeof anonymizedCandidateSchema>;

export const candidateSearchQuerySchema = z.object({
  worked_at: z.string().uuid().optional(),
  segment: segmentSchema.optional(),
  methodology: methodologySchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
