import { Hono } from "hono";
import type { Variables } from "../middleware";

export const webhooksRoutes = new Hono<{ Variables: Variables }>()
  // POST /api/v1/webhooks/stripe  (MOCKED — accept any body, no signature)
  .post("/stripe", async (c) => {
    // TODO(cycle-2): real Stripe webhook signature verification via STRIPE_WEBHOOK_SECRET
    const body = await c.req.text().catch(() => "");
    c.get("log").info({ stripe_webhook_bytes: body.length }, "stripe webhook received (mock)");
    return c.json({ received: true as const });
  });
