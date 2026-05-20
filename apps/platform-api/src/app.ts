import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env";
import { requestId, requireAuth, type Variables } from "./middleware";
import { jobsRoutes } from "./routes/jobs";
import { companiesRoutes } from "./routes/companies";
import { meRoutes } from "./routes/me";
import { candidatesRoutes } from "./routes/candidates";
import { credentialsRoutes } from "./routes/credentials";
import { companyRoutes } from "./routes/company";
import { notificationsRoutes } from "./routes/notifications";
import { conversationsRoutes } from "./routes/conversations";
import { articlesRoutes } from "./routes/articles";
import { webhooksRoutes } from "./routes/webhooks";

const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);

// authed subgroup — Hono RPC types only propagate through chained .route() calls on the same
// builder. Build a single authed builder, then mount it under /api/v1.
const authedV1 = new Hono<{ Variables: Variables }>()
  .use("*", requireAuth)
  .route("/me", meRoutes)
  .route("/candidates", candidatesRoutes)
  .route("/credentials", credentialsRoutes)
  .route("/company", companyRoutes)
  .route("/notifications", notificationsRoutes)
  .route("/conversations", conversationsRoutes);

// v1 group: public routes + authed subgroup, all under /api/v1.
// `articles` is public (Carrying Quota editorial is read-only public content —
// criterion 12's verifier curls /api/v1/articles with no auth header).
const v1 = new Hono<{ Variables: Variables }>()
  .route("/jobs", jobsRoutes)
  .route("/companies", companiesRoutes)
  .route("/articles", articlesRoutes)
  .route("/webhooks", webhooksRoutes)
  .route("/", authedV1);

// root app — chain everything in one expression so the Hono RPC type bubbles through
export const app = new Hono<{ Variables: Variables }>()
  .use("*", requestId)
  .use(
    "*",
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) || allowedOrigins.includes("*") ? origin : ""),
      allowHeaders: ["Authorization", "Content-Type", "X-Request-ID"],
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
    }),
  )
  .get("/healthz", (c) => c.json({ status: "ok" as const, ts: new Date().toISOString() }))
  .route("/api/v1", v1);

export type AppType = typeof app;
