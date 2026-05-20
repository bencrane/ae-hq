/**
 * Feedback primitives — Toast, Banner, Modal, Drawer, Tooltip.
 */

import {
  type MouseEvent,
  type PropsWithChildren,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cx, textColor } from "./utils";

// ────────────── Banner — inline alert ──────────────

export type BannerTone = "info" | "success" | "warn" | "error";

export interface BannerProps {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
}

const bannerStyle: Record<BannerTone, string> = {
  info: "border-[color:rgba(96,165,250,0.4)] bg-[color:rgba(96,165,250,0.08)] text-[color:var(--color-state-info)]",
  success:
    "border-[color:var(--color-border-accent)] bg-[color:var(--color-accent-softer)] text-[color:var(--color-text-accent)]",
  warn: "border-[color:rgba(251,191,36,0.4)] bg-[color:var(--color-state-warnSoft)] text-[color:var(--color-state-warn)]",
  error:
    "border-[color:var(--color-state-error)] bg-[color:var(--color-state-errorSoft)] text-[color:var(--color-state-error)]",
};

export function Banner({ tone = "info", title, children, actions, onDismiss }: BannerProps) {
  return (
    <output className={cx("block rounded-none border px-4 py-3", bannerStyle[tone])}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {title ? (
            <div className="data-mono mb-1 font-mono text-mono-xs uppercase">{title}</div>
          ) : null}
          {children ? (
            <div className={cx("text-body-sm", textColor.default)}>{children}</div>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className={cx("text-mono-sm", textColor.muted)}
          >
            ×
          </button>
        ) : null}
      </div>
    </output>
  );
}

// ────────────── Toast — transient banner, top-right slot ──────────────

export interface ToastProps {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  /** ms before auto-dismiss; 0 disables */
  duration?: number;
  onDismiss?: () => void;
}

export function Toast({ tone = "info", title, children, duration = 0, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!duration || !onDismiss) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [duration, onDismiss]);
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cx(
        "pointer-events-auto rounded-none border px-4 py-3 shadow-lg",
        "min-w-[280px] max-w-[420px]",
        bannerStyle[tone],
      )}
    >
      {title ? (
        <div className="data-mono mb-1 font-mono text-mono-xs uppercase">{title}</div>
      ) : null}
      {children ? <div className={cx("text-body-sm", textColor.default)}>{children}</div> : null}
    </div>
  );
}

// ────────────── Modal — accessible dialog ──────────────

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Accessible name when `title` is absent or non-text. */
  "aria-label"?: string;
}

const modalSize = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" } as const;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  size = "md",
  "aria-label": ariaLabel,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function onBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: native <dialog> top-layer behavior not desired
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape handler is wired via window keydown above
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={!title ? (ariaLabel ?? "Dialog") : undefined}
      onClick={onBackdrop}
      className={cx(
        "fixed inset-0 flex items-center justify-center",
        "bg-[color:var(--color-surface-overlay)] backdrop-blur-sm",
      )}
      style={{ zIndex: 50 }}
    >
      <div
        ref={ref}
        className={cx(
          "relative w-full rounded-xl border bg-[color:var(--color-surface-raised)]",
          "border-[color:var(--color-border-default)]",
          modalSize[size],
        )}
      >
        {title ? (
          <header className={cx("border-b px-6 py-4", "border-[color:var(--color-border-subtle)]")}>
            <h2 id={titleId} className={cx("font-display text-display-sm", textColor.strong)}>
              {title}
            </h2>
            {description ? (
              <p className={cx("mt-1 text-body-sm", textColor.muted)}>{description}</p>
            ) : null}
          </header>
        ) : null}
        <div className="px-6 py-5">{children}</div>
        {actions ? (
          <footer
            className={cx(
              "flex items-center justify-end gap-2 border-t px-6 py-4",
              "border-[color:var(--color-border-subtle)]",
            )}
          >
            {actions}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

// ────────────── Drawer — side panel ──────────────

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  title?: ReactNode;
  children?: ReactNode;
  width?: string;
  /** Accessible name when `title` is absent or non-text. */
  "aria-label"?: string;
}

export function Drawer({
  open,
  onClose,
  side = "right",
  title,
  children,
  width = "420px",
  "aria-label": ariaLabel,
}: DrawerProps) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    // biome-ignore lint/a11y/useSemanticElements: native <dialog> top-layer behavior not desired
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape handler is wired via window keydown above
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={!title ? (ariaLabel ?? "Drawer") : undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cx("fixed inset-0 bg-[color:var(--color-surface-overlay)]")}
      style={{ zIndex: 50 }}
    >
      <aside
        className={cx(
          "absolute top-0 h-full border bg-[color:var(--color-surface-raised)]",
          "border-[color:var(--color-border-default)]",
          side === "right" ? "right-0 border-l" : "left-0 border-r",
        )}
        style={{ width }}
      >
        {title ? (
          <header
            className={cx(
              "flex items-center justify-between border-b px-6 py-4",
              "border-[color:var(--color-border-subtle)]",
            )}
          >
            <h2 id={titleId} className={cx("font-display text-display-sm", textColor.strong)}>
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={cx("text-mono-md", textColor.muted)}
            >
              ×
            </button>
          </header>
        ) : null}
        <div className="px-6 py-5">{children}</div>
      </aside>
    </div>
  );
}

// ────────────── Tooltip — hover/focus reveal ──────────────

export interface TooltipProps extends PropsWithChildren {
  /** Text content of the tip. */
  label: string;
  side?: "top" | "bottom";
}

export function Tooltip({ label, side = "top", children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open ? (
        <span
          role="tooltip"
          className={cx(
            "data-mono pointer-events-none absolute left-1/2 z-50 -translate-x-1/2",
            "rounded-none border px-2 py-1 font-mono text-mono-xs uppercase",
            "border-[color:var(--color-border-default)] bg-[color:var(--color-surface-raised)]",
            textColor.strong,
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
