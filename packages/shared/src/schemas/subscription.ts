import { z } from "zod";

export const subscriptionTierSchema = z.enum(["starter", "growth", "scale"]);
export type SubscriptionTier = z.infer<typeof subscriptionTierSchema>;

export const subscriptionSchema = z.object({
  company_id: z.string().uuid(),
  stripe_subscription_id: z.string().nullable(),
  tier: subscriptionTierSchema,
  unlocks_per_month: z.number().int(),
  unlocks_used_current_period: z.number().int(),
  current_period_start: z.string(),
  current_period_end: z.string(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const billingCheckoutRequestSchema = z.object({
  tier: subscriptionTierSchema,
});

export const billingCheckoutResponseSchema = z.object({
  mock_checkout_url: z.string().url(),
  mock_session_id: z.string(),
});
