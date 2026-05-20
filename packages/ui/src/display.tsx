/**
 * Display primitives — Card, Badge, Avatar, Stat, KVTable, DataTable, Pagination,
 * Spinner, SectionLabel, Button.
 */

import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  forwardRef,
  useState,
} from "react";
import { cx, textColor } from "./utils";

// ────────────── Card ──────────────

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "raised";
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = "default", interactive, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx(
        "rounded-xl border",
        variant === "raised"
          ? "bg-[color:var(--color-surface-raised)]"
          : "bg-[color:var(--color-surface-raised-translucent)] backdrop-blur-sm",
        "border-[color:var(--color-border-subtle)]",
        interactive && "transition-colors hover:border-[color:var(--color-border-default)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {}
export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(function CardHeader(
  { className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx("border-b px-6 py-4 border-[color:var(--color-border-subtle)]", className)}
      {...rest}
    >
      {children}
    </div>
  );
});

export interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {}
export const CardBody = forwardRef<HTMLDivElement, CardBodyProps>(function CardBody(
  { className, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cx("px-6 py-4", className)} {...rest}>
      {children}
    </div>
  );
});

// ────────────── Badge ──────────────

export type BadgeTone = "default" | "good" | "warn" | "muted" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const badgeTones: Record<BadgeTone, string> = {
  default:
    "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] text-[color:var(--color-text-default)]",
  good: "border-[color:var(--color-border-accent)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-text-accent)]",
  warn: "border-[color:rgba(251,191,36,0.4)] bg-[color:var(--color-state-warnSoft)] text-[color:var(--color-state-warn)]",
  muted:
    "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised-translucent)] text-[color:var(--color-text-muted)]",
  info: "border-[color:rgba(96,165,250,0.4)] bg-[color:rgba(96,165,250,0.12)] text-[color:var(--color-state-info)]",
};

export function Badge({ tone = "default", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        "data-mono inline-flex items-center gap-1 rounded-none border px-2 py-0.5",
        "font-mono text-mono-xs uppercase",
        badgeTones[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

// ────────────── Avatar ──────────────

export interface AvatarProps {
  src?: string | null;
  alt?: string;
  initials?: string;
  size?: "sm" | "md" | "lg";
}

const avatarSize = {
  sm: "h-7 w-7 text-mono-xs",
  md: "h-9 w-9 text-mono-sm",
  lg: "h-12 w-12 text-mono-md",
} as const;

export function Avatar({ src, alt, initials, size = "md" }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? ""}
        className={cx(
          "rounded-none border object-cover",
          "border-[color:var(--color-border-subtle)]",
          avatarSize[size],
        )}
      />
    );
  }
  return (
    <div
      role={alt ? "img" : "presentation"}
      aria-label={alt}
      className={cx(
        "flex items-center justify-center rounded-none border font-mono font-semibold",
        "border-[color:var(--color-border-accent)] bg-[color:var(--color-accent-soft)]",
        textColor.accent,
        avatarSize[size],
      )}
    >
      {(initials ?? "AE").slice(0, 2).toUpperCase()}
    </div>
  );
}

// ────────────── CompanyLogo ──────────────

export interface CompanyLogoProps {
  /** Company name — drives the monogram fallback initials. */
  name: string;
  /** Logo URL. May be absent, or present-but-unreachable (a 404). */
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
}

/**
 * A company logo with a monogram fallback.
 *
 * Renders the logo image when a URL is present AND it loads. If the URL is
 * absent — or present but fails to load (a dead logo-CDN entry) — it falls
 * back to a monogram tile (the company's initials). Crucially, on load
 * failure the broken `<img>` is removed from the DOM entirely, so a
 * work-history row never shows a broken-image box.
 */
export function CompanyLogo({ name, logoUrl, size = "md" }: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);
  const initials = name.slice(0, 2).toUpperCase();
  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        onError={() => setFailed(true)}
        className={cx(
          "shrink-0 rounded-none border bg-[color:var(--color-surface-base)] object-contain",
          "border-[color:var(--color-border-subtle)]",
          avatarSize[size],
        )}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={`${name} logo`}
      className={cx(
        "flex shrink-0 items-center justify-center rounded-none border font-mono font-semibold",
        "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]",
        textColor.muted,
        avatarSize[size],
      )}
    >
      {initials}
    </div>
  );
}

// ────────────── Stat ──────────────

export interface StatProps {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: { value: string; tone?: BadgeTone };
}

export function Stat({ label, value, unit, delta }: StatProps) {
  return (
    <div className="flex flex-col">
      <span className={cx("data-mono font-mono text-mono-xs uppercase", textColor.muted)}>
        {label}
      </span>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className={cx("font-mono text-display-md font-semibold tabular-nums", textColor.strong)}
        >
          {value}
        </span>
        {unit ? (
          <span className={cx("font-mono text-body-sm", textColor.muted)}>{unit}</span>
        ) : null}
        {delta ? <Badge tone={delta.tone ?? "good"}>{delta.value}</Badge> : null}
      </div>
    </div>
  );
}

// ────────────── KVTable — label/value rows ──────────────

export interface KVTableProps {
  rows: ReadonlyArray<{ label: string; value: ReactNode }>;
}

export function KVTable({ rows }: KVTableProps) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className="contents">
          <dt className={cx("data-mono font-mono text-mono-xs uppercase", textColor.muted)}>
            {r.label}
          </dt>
          <dd className={cx("text-body-sm", textColor.default)}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ────────────── DataTable — minimal table primitive ──────────────

export interface DataTableColumn<T> {
  key: keyof T | string;
  label: string;
  render?: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
}

export interface DataTableProps<T> {
  columns: ReadonlyArray<DataTableColumn<T>>;
  rows: readonly T[];
  rowKey?: (row: T, i: number) => string;
  empty?: ReactNode;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  empty,
}: DataTableProps<T>) {
  if (rows.length === 0 && empty) {
    return <div>{empty}</div>;
  }
  return (
    <div
      className={cx(
        "overflow-x-auto rounded-xl border",
        "border-[color:var(--color-border-subtle)]",
      )}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr className={cx("border-b", "border-[color:var(--color-border-subtle)]")}>
            {columns.map((c) => (
              <th
                key={String(c.key)}
                scope="col"
                className={cx(
                  "data-mono px-4 py-3 text-left font-mono text-mono-xs uppercase",
                  textColor.muted,
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center",
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey ? rowKey(row, i) : i}
              className={cx(
                "border-b last:border-b-0",
                "border-[color:var(--color-border-subtle)]",
              )}
            >
              {columns.map((c) => {
                const raw = c.render ? c.render(row) : (row[c.key as keyof T] as ReactNode);
                return (
                  <td
                    key={String(c.key)}
                    className={cx(
                      "px-4 py-3 text-body-sm",
                      textColor.default,
                      c.mono && "data-mono font-mono",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                    )}
                  >
                    {raw}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ────────────── Pagination ──────────────

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (next: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={cx("data-mono font-mono text-mono-xs uppercase", textColor.muted)}>
        {total === 0 ? "0" : `${start}–${end}`} OF {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Prev
        </Button>
        <span className={cx("data-mono font-mono text-mono-xs", textColor.muted)}>
          {page} / {pageCount}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ────────────── Spinner ──────────────

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
}

const spinnerSize = { sm: "h-3 w-3", md: "h-4 w-4", lg: "h-6 w-6" } as const;

export function Spinner({ size = "md", label = "Loading" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cx(
        "inline-block animate-spin rounded-full border-2 border-current",
        "border-r-transparent",
        textColor.accent,
        spinnerSize[size],
      )}
    />
  );
}

// ────────────── SectionLabel — eyebrow strip ──────────────

export interface SectionLabelProps extends HTMLAttributes<HTMLSpanElement> {
  index: number;
  children: ReactNode;
}

export function SectionLabel({ index, children, className, ...rest }: SectionLabelProps) {
  return (
    <span
      className={cx(
        "data-mono inline-block font-mono text-mono-xs uppercase",
        textColor.accent,
        className,
      )}
      {...rest}
    >
      {String(index).padStart(2, "0")} <span aria-hidden>{"//"}</span> {children}
    </span>
  );
}

// ────────────── Button ──────────────

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-[color:var(--color-accent-primary)] text-[color:var(--color-text-onAccent)] " +
    "hover:bg-[color:var(--color-accent-primaryHover)] " +
    "active:bg-[color:var(--color-accent-primaryActive)] " +
    "disabled:opacity-50",
  secondary:
    "border bg-[color:var(--color-surface-raised)] text-[color:var(--color-text-strong)] " +
    "border-[color:var(--color-border-default)] " +
    "hover:border-[color:var(--color-border-strong)]",
  ghost:
    "bg-transparent text-[color:var(--color-text-default)] " +
    "hover:bg-[color:var(--color-surface-raised)] hover:text-[color:var(--color-text-strong)]",
  danger:
    "bg-[color:var(--color-state-error)] text-[color:var(--color-text-onAccent)] " +
    "hover:opacity-90",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-mono-xs",
  md: "h-10 px-4 text-mono-sm",
  lg: "h-12 px-6 text-mono-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      data-variant={variant}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-none",
        "data-mono font-mono font-semibold uppercase tracking-wider",
        "transition-colors disabled:cursor-not-allowed",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
