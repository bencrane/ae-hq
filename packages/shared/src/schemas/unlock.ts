import { z } from "zod";

export const unlockStatusSchema = z.enum(["pending", "accepted", "declined", "expired"]);
export type UnlockStatus = z.infer<typeof unlockStatusSchema>;

export const unlockRequestSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  candidate_id: z.string().uuid(),
  status: unlockStatusSchema,
  created_at: z.string(),
  responded_at: z.string().nullable(),
});
export type UnlockRequest = z.infer<typeof unlockRequestSchema>;

export const unlockRequestWithCompanySchema = unlockRequestSchema.extend({
  company: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    logo_url: z.string().url().nullable(),
  }),
});
export type UnlockRequestWithCompany = z.infer<typeof unlockRequestWithCompanySchema>;

export const unlockCreateSchema = z.object({
  message: z.string().max(500).optional(),
});

export const unlockCreateResponseSchema = z.object({
  unlock_request: unlockRequestSchema,
  budget_remaining: z.number().int().min(0),
  mock_stripe_charge_id: z.string(),
});
