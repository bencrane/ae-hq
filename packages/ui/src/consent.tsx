/**
 * Consent & matchmaking primitives — cycle 6.
 *
 * - `Toggle` — an accessible on/off switch. Used by /me/intent for the
 *   `auto_match` and `discoverable` settings — a control with a plain-English
 *   label + description, not a bare checkbox.
 * - `MatchStatusBadge` — a status pill for a `matches` row. Maps each match
 *   status to a tone + label. Used by the matches list, /me/approvals, and the
 *   company inbound-interest surface.
 * - `AnonymousCandidateCard` — an anonymized AE card. Initials, headline,
 *   derived facts — never a real name. Used by the matchmaking discovery
 *   surface and the matches list.
 */

import type { ReactNode } from "react";
import { cx, textColor } from "./utils";

// ────────────── Toggle ──────────────

export interface ToggleProps {
  /** Stable id — links the label to the control. */
  id: string;
  /** Whether the toggle is on. Controlled. */
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The toggle's label — what the setting is. */
  label: ReactNode;
  /** Plain-English explanation of what turning it on does. */
  description?: ReactNode;
  disabled?: boolean;
}

/**
 * An accessible on/off switch. `role="switch"` + `aria-checked` — a screen
 * reader announces it as a switch, not a checkbox. The whole row (label +
 * description + track) is one labelled control. Effortless, not a form field.
 */
export function Toggle({ id, checked, onChange, label, description, disabled }: ToggleProps) {
  // The switch button is empty (the track has no text), so it gets its
  // accessible name from the label via `aria-labelledby` — a `<label for>`
  // association alone is not reliably picked up for a `role="switch"` button.
  const labelId = `${id}-label`;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <span id={labelId} className={cx("block text-body-sm font-medium", textColor.default)}>
          {label}
        </span>
        {description ? (
          <p className={cx("mt-1 text-body-xs", textColor.muted)}>{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-none border",
          "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          checked
            ? "border-[color:var(--color-border-accent)] bg-[color:var(--color-accent-soft)]"
            : "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]",
        )}
      >
        <span
          aria-hidden
          className={cx(
            "inline-block h-4 w-4 transition-transform",
            checked
              ? "translate-x-6 bg-[color:var(--color-accent-primary)]"
              : "translate-x-1 bg-[color:var(--color-text-muted)]",
          )}
        />
      </button>
    </div>
  );
}

// ────────────── MatchStatusBadge ──────────────

export type MatchStatus = "resolved" | "pending_ae" | "pending_company" | "declined" | "expired";

export interface MatchStatusBadgeProps {
  status: MatchStatus;
}

const MATCH_STATUS_META: Record<MatchStatus, { label: string; classes: string }> = {
  resolved: {
    label: "Connected",
    classes:
      "border-[color:var(--color-border-accent)] bg-[color:var(--color-accent-soft)] " +
      "text-[color:var(--color-text-accent)]",
  },
  pending_ae: {
    label: "Awaiting you",
    classes:
      "border-[color:rgba(251,191,36,0.4)] bg-[color:var(--color-state-warnSoft)] " +
      "text-[color:var(--color-state-warn)]",
  },
  pending_company: {
    label: "Awaiting company",
    classes:
      "border-[color:rgba(96,165,250,0.4)] bg-[color:rgba(96,165,250,0.12)] " +
      "text-[color:var(--color-state-info)]",
  },
  declined: {
    label: "Declined",
    classes:
      "border-[color:var(--color-border-subtle)] " +
      "bg-[color:var(--color-surface-raised-translucent)] text-[color:var(--color-text-muted)]",
  },
  expired: {
    label: "Expired",
    classes:
      "border-[color:var(--color-border-subtle)] " +
      "bg-[color:var(--color-surface-raised-translucent)] text-[color:var(--color-text-muted)]",
  },
};

/**
 * A status pill for a `matches` row. The `pending_ae` / `pending_company`
 * distinction is made human ("Awaiting you" vs "Awaiting company") so the
 * viewer knows whose move it is.
 */
export function MatchStatusBadge({ status }: MatchStatusBadgeProps) {
  const meta = MATCH_STATUS_META[status];
  return (
    <span
      className={cx(
        "data-mono inline-flex items-center gap-1 rounded-none border px-2 py-0.5",
        "font-mono text-mono-xs uppercase",
        meta.classes,
      )}
    >
      {meta.label}
    </span>
  );
}

// ────────────── AnonymousCandidateCard ──────────────

export interface AnonymousCandidateCardWorkedAt {
  id: string;
  name: string;
}

export interface AnonymousCandidateCardProps {
  /** The candidate's initials — NEVER their real name (anonymization). */
  initials: string;
  /** The candidate's headline — anonymized, no PII. */
  headline: string | null;
  /** Years of experience. */
  yearsExperience: number;
  /** Sales-segment focus label. */
  segmentFocus: string | null;
  /** Derived sales-motion label. */
  salesMotionLabel: string;
  /** Companies the candidate worked at — shown as logo-less name chips. */
  workedAtCompanies: ReadonlyArray<AnonymousCandidateCardWorkedAt>;
  /** The primary action — express interest. Every card drives toward this. */
  action?: ReactNode;
  /** Optional click handler for the whole card (open the anonymized detail). */
  onClick?: () => void;
}

/**
 * An anonymized AE card for the matchmaking discovery surface. Shows initials,
 * a headline, and derived facts — the candidate's real identity is NEVER on
 * this card (it is revealed only after a match resolves). Every card carries
 * an `action` slot: the directive forbids dead-end browsing — a discovery card
 * always drives toward expressing interest.
 */
export function AnonymousCandidateCard({
  initials,
  headline,
  yearsExperience,
  segmentFocus,
  salesMotionLabel,
  workedAtCompanies,
  action,
  onClick,
}: AnonymousCandidateCardProps) {
  return (
    <div
      className={cx(
        "flex items-center gap-4 rounded-xl border p-4",
        "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]",
        onClick
          ? "cursor-pointer transition-colors hover:border-[color:var(--color-border-default)]"
          : "",
      )}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div
        aria-hidden
        className={cx(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border",
          "border-[color:var(--color-border-accent)] bg-[color:var(--color-accent-soft)]",
          "font-mono text-body-md font-semibold",
          textColor.accent,
        )}
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cx("truncate font-medium", textColor.default)}>
          {headline ?? "Account Executive"}
        </div>
        <div className={cx("data-mono mt-1 font-mono text-mono-xs uppercase", textColor.muted)}>
          {yearsExperience}yrs {"//"} {segmentFocus ?? "—"} {"//"} {salesMotionLabel}
        </div>
        {workedAtCompanies.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {workedAtCompanies.slice(0, 4).map((co) => (
              <span
                key={co.id}
                className={cx(
                  "data-mono inline-flex items-center rounded-none border px-2 py-0.5",
                  "border-[color:var(--color-border-subtle)] font-mono text-mono-xs uppercase",
                  textColor.muted,
                )}
              >
                {co.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
