/**
 * Pipeline primitives — the recruiter kanban board.
 *
 * `KanbanBoard` — the horizontal-scrolling column container.
 * `KanbanColumn` — one stage column with a `StageHeader`.
 * `StageHeader` — the column header (name + count + color accent).
 * `KanbanCard` — one candidate card with a click-to-move stage menu.
 * `CandidateTimeline` / `TimelineEntry` — the per-candidate activity drawer.
 *
 * Click-to-move (a stage menu on each card) is the move mechanism — HTML5
 * drag-and-drop is fragile to drive in e2e, and the directive explicitly
 * permits a click menu. The board stays functional first.
 */

import { type ReactNode, useState } from "react";
import { Badge } from "./display";
import { cx, textColor } from "./utils";

// Stage color token name -> a small accent class for the column header bar.
const STAGE_ACCENT: Record<string, string> = {
  info: "bg-[color:var(--color-state-info)]",
  good: "bg-[color:var(--color-accent-primary)]",
  warn: "bg-[color:var(--color-state-warn)]",
  accent: "bg-[color:var(--color-accent-primary)]",
  muted: "bg-[color:var(--color-text-subtle)]",
  default: "bg-[color:var(--color-border-strong)]",
};

// ────────────── StageHeader ──────────────

export interface StageHeaderProps {
  name: string;
  count: number;
  /** Token color name for the stage accent bar. */
  color?: string;
  isTerminal?: boolean;
}

export function StageHeader({ name, count, color = "default", isTerminal }: StageHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className={cx("h-1 w-full rounded-full", STAGE_ACCENT[color] ?? STAGE_ACCENT.default)} />
      <div className="flex items-center justify-between gap-2">
        <span className={cx("data-mono font-mono text-mono-xs uppercase tracking-wider", textColor.strong)}>
          {name}
        </span>
        <div className="flex items-center gap-1.5">
          {isTerminal ? <Badge tone="muted">TERMINAL</Badge> : null}
          <span
            className={cx(
              "flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5",
              "bg-[color:var(--color-surface-raised)] font-mono text-mono-xs",
              textColor.muted,
            )}
          >
            {count}
          </span>
        </div>
      </div>
    </div>
  );
}

// ────────────── KanbanCard ──────────────

export interface KanbanStageOption {
  id: string;
  name: string;
}

export interface KanbanCardProps {
  /** Candidate initials (anonymized). */
  initials: string;
  headline?: string | null;
  /** Small meta line — segment, years, etc. */
  meta?: string;
  /** Whether this candidate has an active conversation. */
  hasConversation?: boolean;
  notesPreview?: string | null;
  /** Stages this card can be moved to (excludes the current stage). */
  moveTargets: ReadonlyArray<KanbanStageOption>;
  /** Called with the destination stage id when a move target is picked. */
  onMove: (stageId: string) => void;
  /** Called when the card body is clicked (opens the timeline drawer). */
  onOpen?: () => void;
  /** Disable the move menu (e.g. while a move is in flight). */
  moveDisabled?: boolean;
}

export function KanbanCard({
  initials,
  headline,
  meta,
  hasConversation,
  notesPreview,
  moveTargets,
  onMove,
  onOpen,
  moveDisabled,
}: KanbanCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      data-testid="kanban-card"
      className={cx(
        "relative flex flex-col gap-2 rounded-xl border px-4 py-3 transition-colors",
        "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]",
        "hover:border-[color:var(--color-border-default)]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-none border font-mono text-mono-sm font-semibold",
            "border-[color:var(--color-border-accent)] bg-[color:var(--color-accent-soft)]",
            textColor.accent,
          )}
        >
          {initials}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
          data-testid="kanban-card-open"
        >
          <div className={cx("truncate text-body-sm font-medium", textColor.strong)}>
            {headline ?? "Account Executive"}
          </div>
          {meta ? (
            <div className={cx("data-mono truncate font-mono text-mono-xs uppercase", textColor.subtle)}>
              {meta}
            </div>
          ) : null}
        </button>
      </div>
      {notesPreview ? (
        <p className={cx("line-clamp-2 text-body-xs", textColor.muted)}>{notesPreview}</p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        {hasConversation ? (
          <Badge tone="good">IN CONVERSATION</Badge>
        ) : (
          <span className={cx("data-mono font-mono text-mono-xs uppercase", textColor.subtle)}>
            no thread
          </span>
        )}
        <div className="relative">
          <button
            type="button"
            data-testid="kanban-move-trigger"
            disabled={moveDisabled || moveTargets.length === 0}
            onClick={() => setMenuOpen((v) => !v)}
            className={cx(
              "data-mono rounded-none border px-2 py-1 font-mono text-mono-xs uppercase",
              "border-[color:var(--color-border-default)] transition-colors",
              "hover:border-[color:var(--color-border-strong)] disabled:opacity-40",
              textColor.muted,
            )}
          >
            Move ▾
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className={cx(
                "absolute right-0 z-10 mt-1 w-44 rounded-xl border py-1",
                "border-[color:var(--color-border-default)] bg-[color:var(--color-surface-raised)]",
                "shadow-lg",
              )}
            >
              {moveTargets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  data-testid="kanban-move-option"
                  onClick={() => {
                    setMenuOpen(false);
                    onMove(t.id);
                  }}
                  className={cx(
                    "data-mono block w-full px-3 py-1.5 text-left font-mono text-mono-xs uppercase",
                    "transition-colors hover:bg-[color:var(--color-accent-soft)]",
                    textColor.default,
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ────────────── KanbanColumn ──────────────

export interface KanbanColumnProps {
  header: ReactNode;
  children?: ReactNode;
  /** Shown when the column has no cards. */
  emptyLabel?: string;
}

export function KanbanColumn({ header, children, emptyLabel }: KanbanColumnProps) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div
      data-testid="kanban-column"
      className={cx(
        "flex w-[280px] shrink-0 flex-col gap-3 rounded-xl border p-3",
        "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised-translucent)]",
      )}
    >
      {header}
      <div className="flex flex-col gap-2">
        {hasChildren ? (
          children
        ) : (
          <div
            className={cx(
              "rounded-xl border border-dashed px-3 py-6 text-center",
              "border-[color:var(--color-border-subtle)]",
              "data-mono font-mono text-mono-xs uppercase",
              textColor.subtle,
            )}
          >
            {emptyLabel ?? "Empty"}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────── KanbanBoard ──────────────

export interface KanbanBoardProps {
  children?: ReactNode;
  "aria-label"?: string;
}

/** Horizontal-scrolling column container. */
export function KanbanBoard({ children, "aria-label": ariaLabel }: KanbanBoardProps) {
  return (
    <div
      aria-label={ariaLabel ?? "Pipeline board"}
      data-testid="kanban-board"
      className="flex gap-4 overflow-x-auto pb-2"
    >
      {children}
    </div>
  );
}

// ────────────── TimelineEntry ──────────────

export type TimelineEntryKind =
  | "added_to_pipeline"
  | "stage_changed"
  | "note_added"
  | "message_sent"
  | "unlocked";

export interface TimelineEntryProps {
  kind: TimelineEntryKind;
  /** Already-formatted timestamp. */
  timestamp: string;
  /** Human-readable description of the event. */
  description: ReactNode;
}

const ENTRY_LABEL: Record<TimelineEntryKind, string> = {
  added_to_pipeline: "Added",
  stage_changed: "Stage",
  note_added: "Note",
  message_sent: "Message",
  unlocked: "Unlocked",
};

const ENTRY_TONE: Record<TimelineEntryKind, "default" | "good" | "warn" | "muted" | "info"> = {
  added_to_pipeline: "info",
  stage_changed: "good",
  note_added: "muted",
  message_sent: "default",
  unlocked: "good",
};

export function TimelineEntry({ kind, timestamp, description }: TimelineEntryProps) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className="h-2 w-2 rounded-full bg-[color:var(--color-accent-primary)]" />
        <span className="mt-1 w-px flex-1 bg-[color:var(--color-border-subtle)]" />
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2">
          <Badge tone={ENTRY_TONE[kind]}>{ENTRY_LABEL[kind]}</Badge>
          <span className={cx("data-mono font-mono text-mono-xs uppercase", textColor.subtle)}>
            {timestamp}
          </span>
        </div>
        <div className={cx("mt-1.5 text-body-sm", textColor.default)}>{description}</div>
      </div>
    </li>
  );
}

// ────────────── CandidateTimeline ──────────────

export interface CandidateTimelineProps {
  children?: ReactNode;
  /** Shown when there is no activity. */
  emptyLabel?: string;
}

/** Vertical activity feed — a list of `TimelineEntry`s. */
export function CandidateTimeline({ children, emptyLabel }: CandidateTimelineProps) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  if (!hasChildren) {
    return (
      <div className={cx("data-mono font-mono text-mono-xs uppercase", textColor.subtle)}>
        {emptyLabel ?? "No activity yet."}
      </div>
    );
  }
  return <ul className="flex flex-col">{children}</ul>;
}
