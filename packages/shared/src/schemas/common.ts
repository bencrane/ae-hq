import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorSchema>;

export const okSchema = z.object({ ok: z.literal(true) });

export const segmentSchema = z.enum(["SMB", "MidMarket", "Enterprise", "StrategicEnterprise"]);
export type Segment = z.infer<typeof segmentSchema>;

export const methodologySchema = z.enum([
  "MEDDIC",
  "MEDDPICC",
  "ChallengerSale",
  "SPIN",
  "Sandler",
  "BANT",
  "CommandOfMessage",
]);
export type Methodology = z.infer<typeof methodologySchema>;

export const stageSchema = z.enum([
  "Seed",
  "SeriesA",
  "SeriesB",
  "SeriesC",
  "SeriesD",
  "Public",
  "Bootstrapped",
]);
export type Stage = z.infer<typeof stageSchema>;

export const sizeRangeSchema = z.enum(["1-10", "11-50", "51-200", "201-500", "501-1000", "1001+"]);
export type SizeRange = z.infer<typeof sizeRangeSchema>;

// How a company sells. A candidate's sales-motion profile is DERIVED from the
// motions of the companies in their work history (see `deriveSalesMotion`).
export const salesMotionSchema = z.enum(["plg", "sales_led", "enterprise", "hybrid"]);
export type SalesMotion = z.infer<typeof salesMotionSchema>;
