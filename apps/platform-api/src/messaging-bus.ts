/**
 * In-process pub/sub for real-time messaging.
 *
 * The BFF maintains a single shared `EventEmitter`. The conversations SSE
 * stream (`GET /api/v1/conversations/stream`) subscribes ONE listener per
 * connected client, keyed by the caller's `user_id`. When a message is
 * written, the message route emits to the RECIPIENT's `user_id` channel.
 *
 * Single-BFF-instance is the correct design for cycle 3. Multi-instance
 * fan-out (Redis pub/sub) is a cycle-4 concern.
 *
 * // TODO(cycle-4): replace this in-process emitter with a Redis pub/sub layer
 * // so SSE delivery works across multiple BFF instances behind a load balancer.
 */

import { EventEmitter } from "node:events";
import type { Message } from "@ae-hq/shared";

/** Payload pushed to a recipient's channel when a new message is written. */
export type MessageEvent = {
  conversation_id: string;
  message: Message;
};

type ChannelListener = (event: MessageEvent) => void;

// One process-wide emitter. Each SSE connection registers exactly one listener
// on the `user:<id>` event; reconnecting clients accumulate listeners unless
// the stream handler removes its listener on abort — so we raise the cap well
// past the default of 10 and the stream handler MUST call `unsubscribe`.
const emitter = new EventEmitter();
emitter.setMaxListeners(1000);

function channel(userId: string): string {
  return `user:${userId}`;
}

/**
 * Subscribe a recipient's stream to new-message events.
 * Returns an `unsubscribe` fn — the SSE handler MUST call it in `onAbort`
 * (validator prediction #1: unpaired `.on()` leaks listeners on reconnect).
 */
export function subscribe(userId: string, listener: ChannelListener): () => void {
  const ch = channel(userId);
  emitter.on(ch, listener);
  return () => {
    emitter.off(ch, listener);
  };
}

/** Emit a new-message event to a single recipient's channel. */
export function publishToUser(userId: string, event: MessageEvent): void {
  emitter.emit(channel(userId), event);
}

/** Current listener count for a user channel — used by tests / diagnostics. */
export function listenerCount(userId: string): number {
  return emitter.listenerCount(channel(userId));
}
