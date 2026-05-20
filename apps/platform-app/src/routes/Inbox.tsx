import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { ConversationListItem, Message } from "@ae-hq/shared";
import {
  ConversationList,
  ConversationListItem as ConversationItem,
  MessageBubble,
  MessageComposer,
  MessageDayDivider,
  MessageThread,
  Page,
  PageError,
  PageLoading,
  ThreadEmptyState,
} from "@ae-hq/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  useConversation,
  useConversations,
  useConversationStream,
  useMessages,
} from "../lib/use-conversations";

function shortTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}
function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

// Group an ascending message list into day buckets for the day dividers.
function groupByDay(messages: Message[]): Array<{ day: string; messages: Message[] }> {
  const groups: Array<{ day: string; messages: Message[] }> = [];
  for (const m of messages) {
    const day = dayLabel(m.created_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.messages.push(m);
    else groups.push({ day, messages: [m] });
  }
  return groups;
}

export function Inbox() {
  const { conversationId } = useParams();
  const qc = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user?.id;

  // live updates across all of the caller's threads
  useConversationStream(Boolean(session));

  const listQ = useConversations(Boolean(session));
  const conversations: ConversationListItem[] = listQ.data?.conversations ?? [];
  const activeConvQ = useConversation(conversationId);
  const messagesQ = useMessages(conversationId);

  // mark the open thread read once its messages load
  const readM = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.v1.conversations[":id"].read.$post({ param: { id } });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
  // mark the open thread read once its messages load. readM.mutate is a
  // stable callback from react-query; the effect re-runs only when the open
  // conversation or its message data changes.
  const readMutate = readM.mutate;
  useEffect(() => {
    if (conversationId && messagesQ.data) readMutate(conversationId);
  }, [conversationId, messagesQ.data, readMutate]);

  const sendM = useMutation({
    mutationFn: async (body: string) => {
      if (!conversationId) throw new Error("no conversation");
      const res = await api.api.v1.conversations[":id"].messages.$post({
        param: { id: conversationId },
        json: { body },
      });
      if (!res.ok) throw new Error("failed to send");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const activeConv = activeConvQ.data?.conversation as
    | (ConversationListItem & { party: ConversationListItem["party"] })
    | undefined;
  const messages = messagesQ.data?.messages ?? [];

  return (
    <Page variant="full" align="left" data-testid="inbox-page">
      <div className="flex h-[calc(100vh-9rem)] overflow-hidden rounded-xl border border-[color:var(--color-border-subtle)]">
        {/* left pane — conversation list */}
        <div className="flex w-[340px] shrink-0 flex-col border-r border-[color:var(--color-border-subtle)]">
          <div className="border-b border-[color:var(--color-border-subtle)] px-5 py-4">
            <div className="data-mono font-mono text-mono-xs uppercase tracking-[0.2em] text-[color:var(--color-text-accent)]">
              {">"}_ INBOX
            </div>
            <div className="mt-1 font-display text-display-sm font-semibold text-[color:var(--color-text-strong)]">
              Conversations
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {listQ.isLoading ? (
              <PageLoading />
            ) : listQ.isError ? (
              <PageError message="ERR // failed to load conversations" />
            ) : conversations.length === 0 ? (
              <div className="data-mono px-5 py-6 font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
                No conversations yet.
              </div>
            ) : (
              <ConversationList aria-label="Conversations">
                {conversations.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    name={conv.party.display_name}
                    subtitle={conv.party.subtitle}
                    preview={conv.last_message_preview}
                    timestamp={relativeTime(conv.last_message_at)}
                    unreadCount={conv.unread_count}
                    active={conv.id === conversationId}
                    logoUrl={conv.party.logo_url}
                    as={({ className, children }) => (
                      <Link to={`/inbox/${conv.id}`} className={className}>
                        {children}
                      </Link>
                    )}
                  />
                ))}
              </ConversationList>
            )}
          </div>
        </div>

        {/* right pane — active thread */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!conversationId ? (
            <ThreadEmptyState />
          ) : activeConvQ.isLoading ? (
            <PageLoading />
          ) : !activeConv ? (
            <ThreadEmptyState
              title="Conversation not found"
              description="This thread does not exist or you do not have access to it."
            />
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-[color:var(--color-border-subtle)] px-6 py-4">
                <div className="min-w-0">
                  <div className="truncate font-display text-body-lg font-medium text-[color:var(--color-text-strong)]">
                    {activeConv.party.display_name}
                  </div>
                  {activeConv.party.subtitle ? (
                    <div className="data-mono truncate font-mono text-mono-xs uppercase text-[color:var(--color-text-subtle)]">
                      {activeConv.party.subtitle}
                    </div>
                  ) : null}
                </div>
              </div>
              <MessageThread aria-label={`Conversation with ${activeConv.party.display_name}`}>
                {messagesQ.isLoading ? (
                  <PageLoading />
                ) : (
                  groupByDay(messages).map((group) => (
                    <div key={group.day} className="flex flex-col gap-3">
                      <MessageDayDivider label={group.day} />
                      {group.messages.map((m) => (
                        <MessageBubble
                          key={m.id}
                          body={m.body}
                          mine={m.sender_user_id === userId}
                          timestamp={shortTime(m.created_at)}
                          read={Boolean(m.read_at)}
                        />
                      ))}
                    </div>
                  ))
                )}
              </MessageThread>
              <MessageComposer
                onSend={(body) => sendM.mutate(body)}
                disabled={sendM.isPending}
              />
            </>
          )}
        </div>
      </div>
    </Page>
  );
}
