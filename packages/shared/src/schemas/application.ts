import { z } from "zod";

// ─────────────── applications (cycle 5 — the per-job funnel) ───────────────
//
// One row = one candidate in one job posting's pipeline. Distinct from
// `pipeline_candidates` (cycle 3, company-wide) — see the cycle-5 directive's
// data-model note. The per-job board (/co/jobs/:id) reads this table.

export const applicationStatusSchema = z.enum([
  "applied",
  "in_pipeline",
  "rejected",
  "withdrawn",
  "hired",
]);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const applicationSourceSchema = z.enum(["candidate_applied", "company_sourced"]);
export type ApplicationSource = z.infer<typeof applicationSourceSchema>;

export const applicationSchema = z.object({
  id: z.string().uuid(),
  job_id: z.string().uuid(),
  candidate_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  status: applicationStatusSchema,
  source: applicationSourceSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
export type Application = z.infer<typeof applicationSchema>;

// ─────────────── apply ───────────────

// POST /api/v1/jobs/:id/apply takes no body — the candidate id is the JWT
// subject and the job id is the path param. An empty object is accepted so the
// zod validator does not reject `{}`.
export const applyJobBodySchema = z.object({}).strip();

// ─────────────── per-job move ───────────────

export const applicationMoveSchema = z.object({
  stage_id: z.string().uuid(),
});
export type ApplicationMove = z.infer<typeof applicationMoveSchema>;

// ─────────────── candidate's own applications ───────────────

// A candidate's application joined with its job + company for the portal.
export const candidateApplicationSchema = applicationSchema.extend({
  stage_name: z.string().nullable(),
  job: z.object({
    id: z.string().uuid(),
    title: z.string(),
    segment: z.string(),
    location: z.string(),
    is_remote: z.boolean(),
    ote_min: z.number().int(),
    ote_max: z.number().int(),
    company: z.object({
      id: z.string().uuid(),
      slug: z.string(),
      name: z.string(),
      logo_url: z.string().nullable(),
    }),
  }),
});
export type CandidateApplication = z.infer<typeof candidateApplicationSchema>;

// ─────────────── job collections (curated, firmographic-derived) ───────────────

// A job card shape used inside collections and the in-portal browse. Carries an
// `applied` flag so the candidate sees applied-state without a second request.
export const collectionJobSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  segment: z.string(),
  stage: z.string(),
  location: z.string(),
  is_remote: z.boolean(),
  ote_min: z.number().int(),
  ote_max: z.number().int(),
  applied: z.boolean(),
  company: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    logo_url: z.string().nullable(),
    sales_motion: z.string().nullable(),
    stage: z.string().nullable(),
  }),
});
export type CollectionJob = z.infer<typeof collectionJobSchema>;

export const jobCollectionSchema = z.object({
  // a stable id for the collection (the axis key — e.g. "series-b").
  id: z.string(),
  title: z.string(),
  // a one-line description of the curation axis.
  subtitle: z.string(),
  jobs: z.array(collectionJobSchema),
});
export type JobCollection = z.infer<typeof jobCollectionSchema>;

// ─────────────── company jobs overview (the aggregate dashboard) ───────────────

// One stage's slice of a posting's funnel — the compact per-stage count.
export const funnelStageSchema = z.object({
  stage_id: z.string().uuid(),
  stage_name: z.string(),
  color: z.string(),
  count: z.number().int().min(0),
});
export type FunnelStage = z.infer<typeof funnelStageSchema>;

// One row in /co/jobs — a posting with its applicant count + funnel summary.
export const companyJobRowSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  segment: z.string(),
  location: z.string(),
  is_remote: z.boolean(),
  posted_at: z.string(),
  applicant_count: z.number().int().min(0),
  funnel: z.array(funnelStageSchema),
});
export type CompanyJobRow = z.infer<typeof companyJobRowSchema>;

// ─────────────── per-job pipeline (the kanban) ───────────────

// An application card on the per-job kanban — anonymized candidate display.
export const applicationCardSchema = applicationSchema.extend({
  display: z.object({
    initials: z.string(),
    headline: z.string().nullable(),
    segment_focus: z.string().nullable(),
    years_experience: z.number().int(),
  }),
});
export type ApplicationCard = z.infer<typeof applicationCardSchema>;
