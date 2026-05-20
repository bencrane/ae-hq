/**
 * Messaging primitives — the inbox spine.
 *
 * `ConversationList` / `ConversationListItem` — the left pane.
 * `MessageThread` / `MessageBubble` / `MessageDayDivider` — the right pane.
 * `MessageComposer` — the send box.
 * `ThreadEmptyState` — shown when no thread is selected.
 *
 * All token-typed, no raw geometry. The two-pane layout itself is owned by the
 * route's `<Page variant="full">`, not by these primitives.
 */

import { type FormEvent, type KeyboardEvent, type ReactNode, useState } from "react";
import { Avatar } from "./display";
import { cx, textColor } from "./utils";

// ────────────── ConversationList ──────────────

export interface ConversationListProps {
  children?: ReactNode;
  /** Accessible label for the list. */
  "aria-label"?: string;
}

export function ConversationList({ children, "aria-label": ariaLabel }: ConversationListProps) {
  return (
    <ul
      aria-label={ariaLabel ?? "Conversations"}
      className="flex flex-col divide-y divide-[color:var(--color-border-subtle)]"
    >
      {children}
    </ul>
  );
}

// ────────────── ConversationListItem ──────────────

export interface ConversationListItemProps {
  /** Display name of the other party. */
  name: string;
  /** Secondary line — company HQ, candidate headline, etc. */
  subtitle?: string | null;
  /** Last message preview text. */
  preview?: string | null;
  /** Relative/short timestamp string. */
  timestamp?: string | null;
  /** Unread message count — renders a badge when > 0. */
  unreadCount?: number;
  /** Whether this item is the active thread. */
  active?: boolean;
  /** Avatar image src (falls back to initials). */
  logoUrl?: string | null;
  /** Render-prop wrapper so routes can wrap the item in a router <Link>. */
  as?: (props: { className: string; children: ReactNode }) => ReactNode;
  onClick?: () => void;
}

export function ConversationListItem({
  name,
  subtitle,
  preview,
  timestamp,
  unreadCount = 0,
  active,
  logoUrl,
  as,
  onClick,
}: ConversationListItemProps) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
  const inner = (
    <>
      <Avatar src={logoUrl ?? undefined} initials={initials} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cx("truncate text-body-sm font-medium", textColor.strong)}>{name}</span>
          {timestamp ? (
            <span className={cx("data-mono shrink-0 font-mono text-mono-xs", textColor.subtle)}>
              {timestamp}
            </span>
          ) : null}
        </div>
        {subtitle ? (
          <div className={cx("data-mono truncate font-mono text-mono-xs uppercase", textColor.subtle)}>
            {subtitle}
          </div>
        ) : null}
        {preview ? (
          <div className={cx("mt-0.5 truncate text-body-xs", textColor.muted)}>{preview}</div>
        ) : null}
      </div>
      {unreadCount > 0 ? (
        <span
          aria-label={`${unreadCount} unread`}
          className={cx(
            "flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1.5",
            "bg-[color:var(--color-accent-primary)] font-mono text-mono-xs font-semibold",
            "text-[color:var(--color-text-onAccent)]",
          )}
        >
          {unreadCount}
        </span>
      ) : null}
    </>
  );
  const className = cx(
    "flex w-full items-center gap-3 px-5 py-4 text-left transition-colors",
    active
      ? "bg-[color:var(--color-accent-soft)]"
      : "hover:bg-[color:var(--color-surface-raised)]",
  );
  return (
    <li>
      {as ? (
        as({ className, children: inner })
      ) : (
        <button type="button" onClick={onClick} className={className}>
          {inner}
        </button>
      )}
    </li>
  );
}

// ────────────── MessageDayDivider ──────────────

export interface MessageDayDividerProps {
  /** Already-formatted day label, e.g. "May 18". */
  label: string;
}

export function MessageDayDivider({ label }: MessageDayDividerProps) {
  return (
    <div className="flex items-center gap-3 py-2" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-[color:var(--color-border-subtle)]" />
      <span className={cx("data-mono font-mono text-mono-xs uppercase", textColor.subtle)}>
        {label}
      </span>
      <span className="h-px flex-1 bg-[color:var(--color-border-subtle)]" />
    </div>
  );
}

// ────────────── MessageBubble ──────────────

export interface MessageBubbleProps {
  /** Message body text. */
  body: string;
  /** Whether the current viewer sent this message (right-aligned, accent). */
  mine?: boolean;
  /** Short timestamp string. */
  timestamp?: string;
  /** Whether the message has been read by the recipient (mine only). */
  read?: boolean;
}

export function MessageBubble({ body, mine, timestamp, read }: MessageBubbleProps) {
  return (
    <div className={cx("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
      <div
        className={cx(
          "max-w-[78%] whitespace-pre-wrap rounded-xl border px-4 py-2.5 text-body-sm",
          mine
            ? cx(
                "border-[color:var(--color-border-accent)] bg-[color:var(--color-accent-soft)]",
                textColor.strong,
              )
            : cx(
                "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]",
                textColor.default,
              ),
        )}
      >
        {body}
      </div>
      {timestamp ? (
        <span className={cx("data-mono font-mono text-mono-xs", textColor.subtle)}>
          {timestamp}
          {mine ? <span className="ml-1">{read ? "// READ" : "// SENT"}</span> : null}
        </span>
      ) : null}
    </div>
  );
}

// ────────────── MessageThread ──────────────

export interface MessageThreadProps {
  children?: ReactNode;
  /** Accessible label, e.g. "Conversation with Stripe". */
  "aria-label"?: string;
}

/** Scrollable column of message bubbles + day dividers. */
export function MessageThread({ children, "aria-label": ariaLabel }: MessageThreadProps) {
  return (
    <div
      aria-label={ariaLabel ?? "Message thread"}
      className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-6"
    >
      {children}
    </div>
  );
}

// ────────────── MessageComposer ──────────────

export interface MessageComposerProps {
  /** Called with the trimmed message body on send. */
  onSend: (body: string) => void;
  /** Disable the input + button (e.g. while a send is in flight). */
  disabled?: boolean;
  placeholder?: string;
}

/**
 * The send box. Enter sends; Shift+Enter inserts a newline. Empty bodies are
 * ignored. Tagged `data-testid="message-composer"` for the e2e verifier.
 */
export function MessageComposer({ onSend, disabled, placeholder }: MessageComposerProps) {
  const [draft, setDraft] = useState("");

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setDraft("");
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }
  function onFormSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  return (
    <form
      onSubmit={onFormSubmit}
      className="flex items-end gap-3 border-t border-[color:var(--color-border-subtle)] px-6 py-4"
    >
      <textarea
        data-testid="message-composer"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        rows={2}
        placeholder={placeholder ?? "Write a message…"}
        aria-label="Message"
        className={cx(
          "flex-1 resize-none rounded-none border bg-[color:var(--color-surface-base)] px-3 py-2 text-body-sm",
          "border-[color:var(--color-border-subtle)]",
          "focus:border-[color:var(--color-accent-primary)] focus:outline-none",
          "placeholder:text-[color:var(--color-text-subtle)] disabled:opacity-50",
          textColor.strong,
        )}
      />
      <button
        type="submit"
        data-testid="message-send"
        disabled={disabled}
        className={cx(
          "data-mono h-10 shrink-0 rounded-none px-5 font-mono text-mono-sm font-semibold uppercase tracking-wider",
          "bg-[color:var(--color-accent-primary)] text-[color:var(--color-text-onAccent)]",
          "transition-colors hover:bg-[color:var(--color-accent-primaryHover)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        Send
      </button>
    </form>
  );
}

// ────────────── ThreadEmptyState ──────────────

export interface ThreadEmptyStateProps {
  title?: string;
  description?: string;
}

/** Shown in the right pane when no conversation is selected. */
export function ThreadEmptyState({ title, description }: ThreadEmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <div className={cx("data-mono font-mono text-mono-xs uppercase tracking-[0.2em]", textColor.subtle)}>
        {">"}_ INBOX
      </div>
      <h3 className={cx("mt-3 font-display text-display-sm", textColor.strong)}>
        {title ?? "No conversation selected"}
      </h3>
      <p className={cx("mt-2 max-w-sm text-body-sm", textColor.muted)}>
        {description ?? "Pick a conversation from the list to read and reply."}
      </p>
    </div>
  );
}
