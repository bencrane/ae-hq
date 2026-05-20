import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConversationListItem, Message } from "@ae-hq/shared";
import { api, jsonOf } from "./api";
import { env } from "./env";
import { supabase } from "./supabase";

type ConversationListResponse = { conversations: ConversationListItem[] };
type MessageListResponse = { messages: Message[] };

/** All of the caller's conversations, newest activity first. */
export function useConversations(enabled: boolean) {
  return useQuery({
    queryKey: ["conversations"],
    enabled,
    queryFn: async (): Promise<ConversationListResponse> => {
      const res = await api.api.v1.conversations.$get();
      if (!res.ok) throw new Error("failed to load conversations");
      return (await res.json()) as unknown as ConversationListResponse;
    },
  });
}

/** One conversation's metadata (the other party's display block). */
export function useConversation(conversationId: string | undefined) {
  return useQuery({
    queryKey: ["conversation", conversationId],
    enabled: Boolean(conversationId),
    queryFn: async () => {
      const res = await api.api.v1.conversations[":id"].$get({
        param: { id: conversationId as string },
      });
      if (!res.ok) throw new Error("conversation not found");
      return res.json();
    },
  });
}

/** Message history for a conversation, ascending. */
export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ["messages", conversationId],
    enabled: Boolean(conversationId),
    queryFn: async (): Promise<MessageListResponse> => {
      const res = await api.api.v1.conversations[":id"].messages.$get({
        param: { id: conversationId as string },
        query: {},
      });
      if (!res.ok) throw new Error("failed to load messages");
      return (await res.json()) as unknown as MessageListResponse;
    },
  });
}

/**
 * Subscribe to the BFF's conversations SSE stream. New-message events refresh
 * the affected thread + the conversation list so the inbox stays live.
 *
 * EventSource cannot send an Authorization header, and the stream is mounted
 * under the authed route group — so we consume the SSE stream over `fetch`
 * with a manual ReadableStream reader instead.
 */
export function useConversationStream(enabled: boolean) {
  const qc = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    async function connect() {
      // a single reconnecting loop — re-establishes on transient errors
      while (!stopped) {
        try {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token) {
            await sleep(2000);
            continue;
          }
          const res = await fetch(`${env.API_URL}/api/v1/conversations/stream`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
            signal: ctrl.signal,
          });
          if (!res.ok || !res.body) {
            await sleep(2000);
            continue;
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!stopped) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // SSE events are separated by a blank line
            let sep = buffer.indexOf("\n\n");
            while (sep !== -1) {
              const raw = buffer.slice(0, sep);
              buffer = buffer.slice(sep + 2);
              handleEvent(raw, qc);
              sep = buffer.indexOf("\n\n");
            }
          }
        } catch (e) {
          if ((e as Error)?.name === "AbortError") return;
          // transient — fall through to reconnect
        }
        if (!stopped) await sleep(2000);
      }
    }
    void connect();

    return () => {
      stopped = true;
      ctrl.abort();
    };
  }, [enabled, qc]);
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function handleEvent(raw: string, qc: ReturnType<typeof useQueryClient>) {
  // parse the `event:` and `data:` lines of one SSE frame
  let event = "message";
  let dataStr = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
  }
  if (event !== "message" || !dataStr) return;
  try {
    const payload = JSON.parse(dataStr) as { conversation_id: string; message: Message };
    // refresh the affected thread + the conversation list
    void qc.invalidateQueries({ queryKey: ["messages", payload.conversation_id] });
    void qc.invalidateQueries({ queryKey: ["conversations"] });
  } catch {
    // malformed frame — ignore
  }
}
