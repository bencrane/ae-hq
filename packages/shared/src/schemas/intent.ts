import { z } from "zod";
import { segmentSchema, stageSchema } from "./common";

export const intentSignalSchema = z.object({
  candidate_id: z.string().uuid(),
  target_stages: z.array(stageSchema).default([]),
  target_segments: z.array(segmentSchema).default([]),
  comp_ote_min: z.number().int().nullable(),
  target_geos: z.array(z.string()).default([]),
  target_companies: z.array(z.string().uuid()).default([]),
  updated_at: z.string(),
});
export type IntentSignal = z.infer<typeof intentSignalSchema>;

export const intentSignalPutSchema = intentSignalSchema
  .omit({ candidate_id: true, updated_at: true })
  .partial();
export type IntentSignalPut = z.infer<typeof intentSignalPutSchema>;
