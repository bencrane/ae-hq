/**
 * Shared interactive primitives — Tabs and PreferenceTagPicker.
 *
 * `Tabs` / `TabList` / `TabPanel` — an accessible tab set used by /insights
 * (article kinds) and elsewhere. The active tab is controlled state owned by
 * the caller.
 *
 * `PreferenceTagPicker` — a multi-select chip picker. ONE primitive, used by
 * both the AE intent declaration and recruiter candidate filtering. Each
 * option toggles on click; selection is controlled.
 */

import { type KeyboardEvent, type ReactNode, useId } from "react";
import { cx, textColor } from "./utils";

// ────────────── Tabs ──────────────

export interface TabItem {
  /** Stable id, matched against `TabPanel.tabId`. */
  id: string;
  label: ReactNode;
  /** Optional count badge rendered after the label. */
  count?: number;
}

export interface TabsProps {
  /** Currently-active tab id. */
  value: string;
  onValueChange: (next: string) => void;
  children?: ReactNode;
  unsafe_className?: string;
}

/**
 * Tabs container. Owns no geometry beyond a vertical gap between the TabList
 * and the active panel. Pass a `TabList` and one or more `TabPanel`s.
 */
export function Tabs({ children, unsafe_className }: TabsProps) {
  return <div className={cx("flex flex-col gap-6", unsafe_className)}>{children}</div>;
}

export interface TabListProps {
  /** Accessible label for the tablist. */
  "aria-label": string;
  value: string;
  onValueChange: (next: string) => void;
  items: ReadonlyArray<TabItem>;
  unsafe_className?: string;
}

/** The row of tab triggers. Arrow keys move focus + selection. */
export function TabList({
  "aria-label": ariaLabel,
  value,
  onValueChange,
  items,
  unsafe_className,
}: TabListProps) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const idx = items.findIndex((t) => t.id === value);
    if (idx < 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      onValueChange(items[(idx + 1) % items.length]!.id);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      onValueChange(items[(idx - 1 + items.length) % items.length]!.id);
    }
  }
  return (
    // biome-ignore lint/a11y/useFocusableInteractive: focus lives on the active tab button, not the tablist
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cx(
        "flex flex-wrap items-center gap-1 border-b",
        "border-[color:var(--color-border-subtle)]",
        unsafe_className,
      )}
    >
      {items.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(t.id)}
            className={cx(
              "data-mono -mb-px border-b-2 px-4 py-2.5 font-mono text-mono-xs uppercase tracking-wider",
              "transition-colors",
              active
                ? cx("border-[color:var(--color-accent-primary)]", textColor.accent)
                : cx(
                    "border-transparent hover:border-[color:var(--color-border-default)]",
                    textColor.muted,
                  ),
            )}
          >
            {t.label}
            {typeof t.count === "number" ? (
              <span className={cx("ml-2", active ? textColor.accent : textColor.subtle)}>
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  /** Matches the `TabItem.id` this panel belongs to. */
  tabId: string;
  /** The currently-active tab id — the panel renders only when they match. */
  activeId: string;
  children?: ReactNode;
}

/** A single tab panel — rendered only when active. */
export function TabPanel({ tabId, activeId, children }: TabPanelProps) {
  if (tabId !== activeId) return null;
  return (
    <div role="tabpanel" id={`tabpanel-${tabId}`} aria-labelledby={`tab-${tabId}`}>
      {children}
    </div>
  );
}

// ────────────── PreferenceTagPicker ──────────────

export interface PreferenceTagOption {
  value: string;
  label: ReactNode;
}

export interface PreferenceTagPickerProps {
  /** Accessible group label. */
  legend?: ReactNode;
  options: ReadonlyArray<PreferenceTagOption>;
  /** Selected option values. */
  selected: ReadonlyArray<string>;
  onChange: (next: string[]) => void;
  /** Disable interaction. */
  disabled?: boolean;
}

/**
 * Multi-select chip picker. Each option is a toggle button with
 * `aria-pressed`. Shared by AE intent declaration and recruiter candidate
 * filtering — the canonical "pick several from a fixed set" control.
 */
export function PreferenceTagPicker({
  legend,
  options,
  selected,
  onChange,
  disabled,
}: PreferenceTagPickerProps) {
  const groupId = useId();
  function toggle(value: string) {
    if (disabled) return;
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  }
  return (
    <div role="group" aria-labelledby={legend ? groupId : undefined} className="flex flex-col gap-2">
      {legend ? (
        <span
          id={groupId}
          className={cx("data-mono font-mono text-mono-xs uppercase", textColor.muted)}
        >
          {legend}
        </span>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => toggle(o.value)}
              className={cx(
                "data-mono rounded-none border px-3 py-1.5 font-mono text-mono-xs uppercase",
                "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                on
                  ? cx(
                      "border-[color:var(--color-border-accent)] bg-[color:var(--color-accent-soft)]",
                      textColor.accent,
                    )
                  : cx(
                      "border-[color:var(--color-border-subtle)] hover:border-[color:var(--color-border-default)]",
                      textColor.muted,
                    ),
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
