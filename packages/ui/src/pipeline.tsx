/**
 * Pipeline primitives — the recruiter kanban board.
 *
 * `KanbanBoard` — the horizontal-scrolling column container. Owns a dnd-kit
 *   `DndContext`: cards are dragged column→column and dropped to change stage.
 * `KanbanColumn` — one stage column (a dnd-kit droppable) with a `StageHeader`.
 * `StageHeader` — the column header (name + count + color accent).
 * `KanbanCard` — one candidate card (a dnd-kit draggable). Drag it to another
 *   column to move it; click it to open the timeline.
 * `CandidateTimeline` / `TimelineEntry` — the per-candidate activity drawer.
 *
 * Drag-and-drop is real (dnd-kit `PointerSensor` + `KeyboardSensor`) — pick a
 * card up, drag it to another column, drop it. Keyboard users tab to a card,
 * press Space to lift it, arrow to a column, Space to drop. The move writes a
 * `pipeline_activity` row exactly as the old click-to-move dropdown did.
 */

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
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
      <span
        className={cx("h-1 w-full rounded-full", STAGE_ACCENT[color] ?? STAGE_ACCENT.default)}
      />
      <div className="flex items-center justify-between gap-2">
        <span
          className={cx(
            "data-mono font-mono text-mono-xs uppercase tracking-wider",
            textColor.strong,
          )}
        >
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

export interface KanbanCardProps {
  /** Stable candidate id — the dnd-kit draggable id and the move subject. */
  candidateId: string;
  /** Candidate initials (anonymized). */
  initials: string;
  headline?: string | null;
  /** Small meta line — segment, years, etc. */
  meta?: string;
  /** Whether this candidate has an active conversation. */
  hasConversation?: boolean;
  notesPreview?: string | null;
  /** Called when the card is clicked (opens the timeline drawer). */
  onOpen?: () => void;
}

/**
 * A draggable candidate card. The whole card is the drag handle — a plain
 * pointer-down then movement past the activation distance starts a drag; a
 * pointer-down with no movement is a click and opens the timeline. Keyboard:
 * focus the card and press Space to lift it, arrows to choose a column.
 */
export function KanbanCard({
  candidateId,
  initials,
  headline,
  meta,
  hasConversation,
  notesPreview,
  onOpen,
}: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: candidateId,
  });
  return (
    <div
      ref={setNodeRef}
      data-testid="kanban-card"
      data-pipeline-candidate-id={candidateId}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        // While dragging, lift the card above the columns so it is never
        // clipped as it crosses a column boundary.
        zIndex: isDragging ? 50 : undefined,
      }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={cx(
        "relative flex cursor-grab flex-col gap-2 rounded-xl border px-4 py-3",
        "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]",
        "transition-colors hover:border-[color:var(--color-border-default)]",
        "focus-visible:outline-2 focus-visible:outline-[color:var(--color-border-accent)]",
        isDragging && "cursor-grabbing opacity-60 shadow-lg",
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
        <div className="min-w-0 flex-1">
          <div className={cx("truncate text-body-sm font-medium", textColor.strong)}>
            {headline ?? "Account Executive"}
          </div>
          {meta ? (
            <div
              className={cx("data-mono truncate font-mono text-mono-xs uppercase", textColor.muted)}
            >
              {meta}
            </div>
          ) : null}
        </div>
      </div>
      {notesPreview ? (
        <p className={cx("line-clamp-2 text-body-xs", textColor.muted)}>{notesPreview}</p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        {hasConversation ? (
          <Badge tone="good">IN CONVERSATION</Badge>
        ) : (
          <span className={cx("data-mono font-mono text-mono-xs uppercase", textColor.muted)}>
            no thread
          </span>
        )}
        <span
          aria-hidden
          className={cx("data-mono font-mono text-mono-xs uppercase", textColor.muted)}
        >
          drag to move
        </span>
      </div>
    </div>
  );
}

// ────────────── ApplicantKanbanCard ──────────────

export interface ApplicantKanbanCardProps {
  /** Stable application id — the dnd-kit draggable id and the move subject. */
  applicationId: string;
  /** Candidate initials (anonymized). */
  initials: string;
  /** Primary label — the candidate headline. Carries the truncation testid. */
  headline?: string | null;
  /** Small meta line — segment, years, etc. */
  meta?: string;
  /** Application source — candidate_applied vs company_sourced. */
  source?: "candidate_applied" | "company_sourced";
  /** Called when the card is clicked. */
  onOpen?: () => void;
}

/**
 * A draggable applicant card for the per-job kanban (`/co/jobs/:id`). The whole
 * card is the drag handle. Distinct from `KanbanCard` (the cycle-3 company-wide
 * board): this card's subject is an `application` (`data-application-id`), and
 * its primary label carries `data-testid="kanban-card-label"` so the kanban
 * geometry verifier can confirm the label is not truncated.
 */
export function ApplicantKanbanCard({
  applicationId,
  initials,
  headline,
  meta,
  source,
  onOpen,
}: ApplicantKanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: applicationId,
  });
  return (
    <div
      ref={setNodeRef}
      data-testid="kanban-card"
      data-application-id={applicationId}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        zIndex: isDragging ? 50 : undefined,
      }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={cx(
        "relative flex cursor-grab flex-col gap-2 rounded-xl border px-4 py-3",
        "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]",
        "transition-colors hover:border-[color:var(--color-border-default)]",
        "focus-visible:outline-2 focus-visible:outline-[color:var(--color-border-accent)]",
        isDragging && "cursor-grabbing opacity-60 shadow-lg",
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
        <div className="min-w-0 flex-1">
          <div
            data-testid="kanban-card-label"
            className={cx("line-clamp-2 text-body-sm font-medium", textColor.strong)}
          >
            {headline ?? "Account Executive"}
          </div>
          {meta ? (
            <div
              className={cx("data-mono truncate font-mono text-mono-xs uppercase", textColor.muted)}
            >
              {meta}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        {source === "company_sourced" ? (
          <Badge tone="info">SOURCED</Badge>
        ) : (
          <Badge tone="good">APPLIED</Badge>
        )}
        <span
          aria-hidden
          className={cx("data-mono font-mono text-mono-xs uppercase", textColor.muted)}
        >
          drag to move
        </span>
      </div>
    </div>
  );
}

// ────────────── KanbanColumn ──────────────

export interface KanbanColumnProps {
  /** Stable stage id — the dnd-kit droppable id and the move destination. */
  stageId: string;
  header: ReactNode;
  children?: ReactNode;
  /** Shown when the column has no cards. */
  emptyLabel?: string;
}

/** One stage column — a dnd-kit drop target. A card dropped here moves to this stage. */
export function KanbanColumn({ stageId, header, children, emptyLabel }: KanbanColumnProps) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  return (
    <div
      ref={setNodeRef}
      data-testid="kanban-column"
      data-pipeline-stage-id={stageId}
      className={cx(
        // 300px — a readable column width. The board owns the horizontal
        // scroll (KanbanBoard has overflow-x-auto), so columns are NEVER
        // shrunk to fit a viewport — `shrink-0` holds each column at its full
        // 300px and the track scrolls within the board's own region. A column
        // width below ~280px truncates card labels (cycle-4 regression).
        "flex w-[300px] shrink-0 flex-col gap-3 rounded-xl border p-3 transition-colors",
        "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised-translucent)]",
        isOver && "border-[color:var(--color-border-accent)] bg-[color:var(--color-accent-soft)]",
      )}
    >
      {header}
      <div className="flex min-h-[4rem] flex-col gap-2">
        {hasChildren ? (
          children
        ) : (
          <div
            className={cx(
              "rounded-xl border border-dashed px-3 py-6 text-center",
              "border-[color:var(--color-border-subtle)]",
              "data-mono font-mono text-mono-xs uppercase",
              textColor.muted,
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
  /**
   * Called when a card is dropped on a column: the dragged candidate's id and
   * the destination stage id. The consumer persists the stage change.
   */
  onMoveCandidate?: (candidateId: string, toStageId: string) => void;
}

/**
 * Horizontal-scrolling column container + dnd-kit `DndContext`.
 *
 * The board owns its own horizontal scroll region (`overflow-x-auto`): the
 * column track is as wide as its content, so every column is reachable by
 * scrolling the board — the page never clips columns past the fold.
 */
export function KanbanBoard({
  children,
  "aria-label": ariaLabel,
  onMoveCandidate,
}: KanbanBoardProps) {
  // PointerSensor with an 8px activation distance: a click (no movement) opens
  // the card timeline; movement past 8px starts a drag. KeyboardSensor makes
  // the board fully keyboard-operable.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(event: DragEndEvent) {
    const candidateId = String(event.active.id);
    const toStageId = event.over ? String(event.over.id) : null;
    if (toStageId) onMoveCandidate?.(candidateId, toStageId);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div
        aria-label={ariaLabel ?? "Pipeline board"}
        data-testid="kanban-board"
        className="flex w-full gap-3 overflow-x-auto pb-3"
      >
        {children}
      </div>
    </DndContext>
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
          <span className={cx("data-mono font-mono text-mono-xs uppercase", textColor.muted)}>
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
      <div className={cx("data-mono font-mono text-mono-xs uppercase", textColor.muted)}>
        {emptyLabel ?? "No activity yet."}
      </div>
    );
  }
  return <ul className="flex flex-col">{children}</ul>;
}
