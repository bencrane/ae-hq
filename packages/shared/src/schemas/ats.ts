import { z } from "zod";

export const atsVendorSchema = z.enum(["greenhouse", "lever", "ashby", "rippling", "bamboohr"]);
export type AtsVendor = z.infer<typeof atsVendorSchema>;

export const atsConnectionSchema = z.object({
  company_id: z.string().uuid(),
  vendor: atsVendorSchema,
  last_synced_at: z.string().nullable(),
  is_connected: z.boolean(),
});
export type AtsConnection = z.infer<typeof atsConnectionSchema>;

export const atsConnectRequestSchema = z.object({
  api_key: z.string().min(1),
});

export const atsConnectResponseSchema = z.object({
  connection: atsConnectionSchema,
});
