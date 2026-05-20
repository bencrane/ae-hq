import { z } from "zod";

// Carrying Quota editorial — authored elsewhere, surfaced read-only on /insights.

export const articleKindSchema = z.enum([
  "company_spotlight",
  "compensation_data",
  "leadership_moves",
]);
export type ArticleKind = z.infer<typeof articleKindSchema>;

export const articleSchema = z.object({
  id: z.string().uuid(),
  kind: articleKindSchema,
  slug: z.string(),
  title: z.string(),
  dek: z.string().nullable(),
  hero_image_url: z.string().nullable(),
  body_md: z.string().nullable(),
  author_name: z.string().nullable(),
  read_minutes: z.number().int().nullable(),
  tags: z.array(z.string()),
  published_at: z.string(),
});
export type Article = z.infer<typeof articleSchema>;

// List endpoint omits the heavy body_md.
export const articleSummarySchema = articleSchema.omit({ body_md: true });
export type ArticleSummary = z.infer<typeof articleSummarySchema>;

export const articleListQuerySchema = z.object({
  kind: articleKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
