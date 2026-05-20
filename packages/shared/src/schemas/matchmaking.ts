import { z } from "zod";
import { segmentSchema } from "./common";

// ── company match-criteria — a company's standing consent ──────────────────

/**
 * The PUT body for /api/v1/company/match-criteria. Every field is the
 * directive's named criteria dimension. Empty arrays mean "no constraint" on
 * that dimension (a company that sets no segments is open to every segment).
 *
 * `sales_motions` is an array of free strings rather than the constrained
 * `salesMotionSchema` enum: a company's match-criteria can describe a sought
 * sales motion in its own vocabulary (e.g. "land_and_expand"), which is not
 * the same closed set as the firmographic `companies.sales_motion` enum. The
 * consent engine compares it against the candidate's DERIVED motion; a value
 * outside the canonical four simply never matches — it is not invalid input.
 */
export const companyMatchCriteriaPutSchema = z.object({
  segments: z.array(segmentSchema).default([]),
  sales_motions: z.array(z.string()).default([]),
  min_years_experience: z.number().int().min(0).max(40).default(0),
  worked_at_company_ids: z.array(z.string().uuid()).default([]),
  investor_pedigree: z.array(z.string()).default([]),
});
export type CompanyMatchCriteriaPut = z.infer<typeof companyMatchCriteriaPutSchema>;

// ── company discover — the matchmaking criteria query ──────────────────────

/**
 * The POST body for /api/v1/company/discover — the criteria-builder query.
 * Each field NARROWS the result set; an omitted/empty field is "no narrowing".
 * The discoverability rule (AE exposure filter) is applied on top regardless.
 * This is a deterministic predicate filter — there is NO ranking field.
 */
export const companyDiscoverQuerySchema = z.object({
  segments: z.array(segmentSchema).optional(),
  sales_motions: z.array(z.string()).optional(),
  min_years_experience: z.number().int().min(0).max(40).optional(),
  worked_at_company_ids: z.array(z.string().uuid()).optional(),
  investor_pedigree: z.array(z.string()).optional(),
});
export type CompanyDiscoverQuery = z.infer<typeof companyDiscoverQuerySchema>;

// ── express interest ───────────────────────────────────────────────────────

/**
 * AE-initiated express-interest body. The AE expresses interest toward a
 * company, optionally tied to a specific job posting.
 */
export const aeExpressInterestSchema = z.object({
  company_id: z.string().uuid(),
  job_id: z.string().uuid().optional(),
});
export type AeExpressInterest = z.infer<typeof aeExpressInterestSchema>;

/**
 * Company-initiated express-interest body. The candidate is the `:id` path
 * param; the body optionally ties the match to a job posting.
 */
export const companyExpressInterestSchema = z.object({
  job_id: z.string().uuid().optional(),
});
export type CompanyExpressInterest = z.infer<typeof companyExpressInterestSchema>;

// ── matches ────────────────────────────────────────────────────────────────

export const matchStatusSchema = z.enum([
  "resolved",
  "pending_ae",
  "pending_company",
  "declined",
  "expired",
]);
export type MatchStatus = z.infer<typeof matchStatusSchema>;

export const matchOriginSchema = z.enum(["ae_initiated", "company_initiated"]);
export type MatchOrigin = z.infer<typeof matchOriginSchema>;

/** Optional status filter for GET /api/v1/matches. */
export const matchListQuerySchema = z.object({
  status: matchStatusSchema.optional(),
});
export type MatchListQuery = z.infer<typeof matchListQuerySchema>;

/** The accept/decline body — an empty object (the action is in the path). */
export const matchDecisionSchema = z.object({}).optional();
