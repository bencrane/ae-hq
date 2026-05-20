import type { Meta, StoryObj } from "@storybook/react";
import {
  ConversationList,
  ConversationListItem,
  MessageBubble,
  MessageComposer,
  MessageDayDivider,
  MessageThread,
  ThreadEmptyState,
} from "./messaging";

const meta = {
  title: "Messaging",
} satisfies Meta;

export default meta;

export const ConversationListDefault: StoryObj = {
  name: "ConversationList",
  render: () => (
    <div className="max-w-sm border border-[color:var(--color-border-subtle)]">
      <ConversationList aria-label="Conversations">
        <ConversationListItem
          name="Stripe"
          subtitle="San Francisco, CA"
          preview="Perfect — sending an invite for Tuesday at 10am."
          timestamp="2h"
          unreadCount={2}
          active
        />
        <ConversationListItem
          name="Snowflake"
          subtitle="Bozeman, MT"
          preview="Team hit 84% on average last year."
          timestamp="1d"
        />
        <ConversationListItem
          name="Datadog"
          subtitle="New York, NY"
          preview="Happy to connect you with a current AE."
          timestamp="3d"
        />
      </ConversationList>
    </div>
  ),
};

export const ConversationListItemStates: StoryObj = {
  name: "ConversationListItem — states",
  render: () => (
    <div className="max-w-sm border border-[color:var(--color-border-subtle)]">
      <ConversationList>
        <ConversationListItem name="Active thread" subtitle="With unread" unreadCount={4} active />
        <ConversationListItem name="Idle thread" subtitle="No unread" preview="Last message…" />
      </ConversationList>
    </div>
  ),
};

export const MessageBubbleDefault: StoryObj = {
  name: "MessageBubble — mine + theirs",
  render: () => (
    <div className="flex max-w-lg flex-col gap-3">
      <MessageBubble
        body="Hi — I came across your background closing enterprise fintech deals."
        timestamp="10:02"
      />
      <MessageBubble
        body="Thanks for reaching out. What does the territory look like?"
        timestamp="10:14"
        mine
        read
      />
      <MessageBubble body="Named-account model — 25 strategic accounts." timestamp="10:20" />
      <MessageBubble body="That lines up well. Let's set up a call." timestamp="10:31" mine />
    </div>
  ),
};

export const MessageDayDividerDefault: StoryObj = {
  name: "MessageDayDivider",
  render: () => <MessageDayDivider label="May 18" />,
};

export const MessageThreadDefault: StoryObj = {
  name: "MessageThread",
  render: () => (
    <div className="flex h-80 max-w-lg flex-col border border-[color:var(--color-border-subtle)]">
      <MessageThread aria-label="Conversation with Stripe">
        <MessageDayDivider label="May 18" />
        <MessageBubble
          body="Hello — open to a quick chat about an Enterprise AE seat?"
          timestamp="09:00"
        />
        <MessageBubble body="Sure, tell me more about the role." timestamp="09:12" mine read />
        <MessageDayDivider label="May 19" />
        <MessageBubble body="Sending over the comp plan now." timestamp="11:40" />
      </MessageThread>
    </div>
  ),
};

export const MessageComposerDefault: StoryObj = {
  name: "MessageComposer",
  render: () => (
    <div className="max-w-lg border border-[color:var(--color-border-subtle)]">
      <MessageComposer onSend={() => {}} />
    </div>
  ),
};

export const MessageComposerDisabled: StoryObj = {
  name: "MessageComposer — disabled",
  render: () => (
    <div className="max-w-lg border border-[color:var(--color-border-subtle)]">
      <MessageComposer onSend={() => {}} disabled />
    </div>
  ),
};

export const ThreadEmptyStateDefault: StoryObj = {
  name: "ThreadEmptyState",
  render: () => (
    <div className="flex h-80 border border-[color:var(--color-border-subtle)]">
      <ThreadEmptyState />
    </div>
  ),
};
