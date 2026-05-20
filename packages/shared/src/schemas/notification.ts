import { z } from "zod";

export const notificationKindSchema = z.enum([
  "unlock_requested",
  "unlock_accepted",
  "unlock_declined",
  "credential_verified",
  "subscription_updated",
]);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  kind: notificationKindSchema,
  payload_json: z.record(z.unknown()),
  read_at: z.string().nullable(),
  created_at: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationListResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  unread_count: z.number().int().min(0),
});
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
