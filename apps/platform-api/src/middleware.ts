import type { Context, Next } from "hono";
import { logger } from "./logger";
import { verifyJwt } from "./auth";

export type Variables = {
  requestId: string;
  userId: string;
  userEmail: string;
  log: ReturnType<typeof logger.child>;
};

export async function requestId(c: Context<{ Variables: Variables }>, next: Next) {
  const incoming = c.req.header("x-request-id");
  const id = incoming && incoming.length < 200 ? incoming : crypto.randomUUID();
  c.set("requestId", id);
  c.set("log", logger.child({ request_id: id }));
  c.header("x-request-id", id);
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  c.get("log").info({ method: c.req.method, path: c.req.path, status: c.res.status, ms }, "req");
}

export async function requireAuth(c: Context<{ Variables: Variables }>, next: Next) {
  const auth = c.req.header("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) {
    return c.json({ error: { code: "unauthorized", message: "missing bearer token" } }, 401);
  }
  try {
    const claims = await verifyJwt(m[1]!);
    c.set("userId", claims.sub);
    c.set("userEmail", claims.email ?? "");
    await next();
  } catch (e) {
    c.get("log").warn({ err: (e as Error).message }, "auth failed");
    return c.json({ error: { code: "unauthorized", message: "invalid token" } }, 401);
  }
}
