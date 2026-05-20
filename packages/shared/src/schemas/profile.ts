import { z } from "zod";

export const profileKindSchema = z.enum(["candidate", "company_member", "admin"]);
export type ProfileKind = z.infer<typeof profileKindSchema>;

export const profileSchema = z.object({
  user_id: z.string().uuid(),
  kind: profileKindSchema,
  email: z.string().email(),
  name: z.string(),
  avatar_url: z.string().url().nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

export const meResponseSchema = z.object({
  profile: profileSchema,
  candidate_id: z.string().uuid().nullable(),
  company_id: z.string().uuid().nullable(),
  company_role: z.enum(["admin", "recruiter", "member"]).nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
