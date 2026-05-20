import { z } from "zod";
import { salesMotionSchema, sizeRangeSchema, stageSchema } from "./common";

export const companySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  domain: z.string().nullable(),
  logo_url: z.string().url().nullable(),
  hq_location: z.string().nullable(),
  size_range: sizeRangeSchema.nullable(),
  stage: stageSchema.nullable(),
  description: z.string().nullable(),
  is_claimed: z.boolean(),
  is_subscribed: z.boolean(),
  // Cycle-4 firmographics (additive — migration 0003).
  sales_motion: salesMotionSchema.nullable(),
  founded_year: z.number().int().nullable(),
  investors: z.array(z.string()).default([]),
  employee_count: z.number().int().nullable(),
});
export type Company = z.infer<typeof companySchema>;

export const companyPatchSchema = companySchema
  .pick({
    name: true,
    domain: true,
    logo_url: true,
    hq_location: true,
    size_range: true,
    stage: true,
    description: true,
  })
  .partial();

export const companyPublicSchema = companySchema.extend({
  open_jobs: z.number().int().min(0),
});
export type CompanyPublic = z.infer<typeof companyPublicSchema>;
