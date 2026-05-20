import { z } from "zod";
import { segmentSchema, stageSchema } from "./common";

export const intentSignalSchema = z.object({
  candidate_id: z.string().uuid(),
  target_stages: z.array(stageSchema).default([]),
  target_segments: z.array(segmentSchema).default([]),
  comp_ote_min: z.number().int().nullable(),
  target_geos: z.array(z.string()).default([]),
  target_companies: z.array(z.string().uuid()).default([]),
  // cycle-6 additions — the investor dimension, watched companies, and the two
  // standing-consent / discoverability toggles.
  target_investors: z.array(z.string()).default([]),
  watched_companies: z.array(z.string().uuid()).default([]),
  auto_match: z.boolean().default(false),
  discoverable: z.boolean().default(true),
  updated_at: z.string(),
});
export type IntentSignal = z.infer<typeof intentSignalSchema>;

export const intentSignalPutSchema = intentSignalSchema
  .omit({ candidate_id: true, updated_at: true })
  .partial();
export type IntentSignalPut = z.infer<typeof intentSignalPutSchema>;
