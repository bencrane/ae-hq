import { app } from "./app";
import { env } from "./env";
import { logger } from "./logger";

logger.info({ port: env.PORT, env: env.APP_ENV }, "platform-api booting");

export default {
  port: env.PORT,
  fetch: app.fetch,
  idleTimeout: 60, // long enough for SSE heartbeats
};
