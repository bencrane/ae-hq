import { z } from "zod";
import { segmentSchema, methodologySchema, stageSchema } from "./common";

export const jobSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  title: z.string(),
  segment: segmentSchema,
  ote_min: z.number().int(),
  ote_max: z.number().int(),
  base_min: z.number().int(),
  base_max: z.number().int(),
  deal_size_avg: z.number().int(),
  sales_cycle_days: z.number().int(),
  methodology: methodologySchema.nullable(),
  stack: z.array(z.string()),
  stage: stageSchema,
  location: z.string(),
  is_remote: z.boolean(),
  posted_at: z.string(),
});
export type Job = z.infer<typeof jobSchema>;

export const jobWithCompanySchema = jobSchema.extend({
  company: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    logo_url: z.string().url().nullable(),
    hq_location: z.string().nullable(),
  }),
});
export type JobWithCompany = z.infer<typeof jobWithCompanySchema>;

export const jobSearchQuerySchema = z.object({
  segment: segmentSchema.optional(),
  stage: stageSchema.optional(),
  methodology: methodologySchema.optional(),
  is_remote: z.coerce.boolean().optional(),
  ote_min: z.coerce.number().int().optional(),
  q: z.string().optional(),
  // When true + an authenticated candidate, the feed is filtered by the
  // caller's intent_signals (a plain SQL WHERE — not a ranking algorithm).
  // Anon callers and `for_me` unset get the full set.
  for_me: z.coerce.boolean().optional(),
  // Default 100 so an unparametrized `GET /jobs` returns the whole seeded
  // table — this keeps the `for_me` SQL-filtered feed a provable strict
  // subset of the unfiltered feed (the filter narrows the same row set).
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
