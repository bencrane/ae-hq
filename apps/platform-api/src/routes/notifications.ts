import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { supabaseAdmin } from "../db";
import type { Variables } from "../middleware";

export const notificationsRoutes = new Hono<{ Variables: Variables }>()
  // GET /api/v1/notifications
  .get("/", async (c) => {
    const userId = c.get("userId");
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    const unread = (data ?? []).filter((n) => !n.read_at).length;
    return c.json({ notifications: data ?? [], unread_count: unread });
  })
  // POST /api/v1/notifications/:id/read
  .post("/:id/read", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) return c.json({ error: { code: "db_error", message: error.message } }, 500);
    if (!data) return c.json({ error: { code: "not_found", message: "notification not found" } }, 404);
    return c.json({ notification: data });
  })
  // GET /api/v1/notifications/stream  (SSE)
  // p4 predicted fix: streamSSE + Cache-Control + X-Accel-Buffering
  .get("/stream", (c) => {
    const userId = c.get("userId");
    c.header("Cache-Control", "no-cache, no-transform");
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      let lastSeen = new Date();
      // Send initial heartbeat so the client knows the stream is open
      await stream.writeSSE({ event: "ready", data: JSON.stringify({ user_id: userId }) });
      let closed = false;
      stream.onAbort(() => {
        closed = true;
      });
      while (!closed) {
        const { data } = await supabaseAdmin
          .from("notifications")
          .select("*")
          .eq("user_id", userId)
          .gt("created_at", lastSeen.toISOString())
          .order("created_at", { ascending: true });
        for (const n of data ?? []) {
          await stream.writeSSE({ event: "notification", data: JSON.stringify(n) });
          lastSeen = new Date(n.created_at);
        }
        // heartbeat every 15s to keep proxies happy
        await stream.writeSSE({ event: "ping", data: String(Date.now()) });
        await stream.sleep(5000);
      }
    });
  });
