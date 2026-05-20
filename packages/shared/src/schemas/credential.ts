import { z } from "zod";

export const credentialKindSchema = z.enum([
  "quota_attainment",
  "deal_value",
  "logos_closed",
  "tenure",
  "income_w2",
  "income_1099",
]);
export type CredentialKind = z.infer<typeof credentialKindSchema>;

export const verificationTierSchema = z.enum([
  "self_reported",
  "csv_upload",
  "plaid_payroll",
  "ats_attestation",
]);
export type VerificationTier = z.infer<typeof verificationTierSchema>;

export const verifiedCredentialSchema = z.object({
  id: z.string().uuid(),
  candidate_id: z.string().uuid(),
  kind: credentialKindSchema,
  period_start: z.string(),
  period_end: z.string(),
  value_json: z.record(z.unknown()),
  source: z.string(),
  verification_tier: verificationTierSchema,
  captured_at: z.string(),
});
export type VerifiedCredential = z.infer<typeof verifiedCredentialSchema>;

export const uploadSignRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  content_type: z.string(),
  byte_size: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
});

export const uploadSignResponseSchema = z.object({
  upload_id: z.string().uuid(),
  upload_url: z.string().url(),
  expires_at: z.string(),
});

export const uploadParseRequestSchema = z.object({
  kind: credentialKindSchema,
});

export const uploadParseResponseSchema = z.object({
  credential_id: z.string().uuid(),
  preview: z.record(z.unknown()),
});

export const plaidLinkTokenResponseSchema = z.object({
  link_token: z.string(),
  expiration: z.string(),
});

export const plaidExchangeRequestSchema = z.object({
  public_token: z.string(),
});

export const plaidExchangeResponseSchema = z.object({
  credentials_imported: z.number().int(),
});
