/**
 * Page primitives.
 *
 * `<Page>` owns route geometry — every route opens with one. It chooses a width
 * variant, applies the horizontal padding gutter, and emits the chrome scaffold.
 * Route files MUST NOT have their own `mx-auto` / `max-w-*` / `px-*` / `py-*` /
 * `gap-*` on top-level JSX — the AST verifier (criterion 10) enforces this.
 *
 * `<PageHeader>` renders the eyebrow + title and tags the eyebrow with
 * `data-page-header-eyebrow` for the alignment verifier (criterion 11) to probe.
 *
 * Width variants come from `packages/tokens` `pageWidth.*`; the JS-side mapping
 * is in `utils.ts` and emits a Tailwind arbitrary-value class (rendered exactly
 * once, here, never copy-pasted to a route).
 */

import { type ElementType, type ReactNode, forwardRef } from "react";
import { type PageVariantProp, cx, pageMaxWidth, space, textColor } from "./utils";

// ────────────── Page ──────────────

export interface PageProps {
  /** Width variant — defaults to "default" (72rem). Use "wide" for Home/CoCandidates. */
  variant?: PageVariantProp;
  /**
   * Horizontal placement.
   *   "left" (default) — content hugs the left rail. Correct for portal routes
   *     (`/me/*`, `/co/*`) where the 260px sidebar IS the left structure.
   *   "center" — content centers in the viewport. Correct for standalone routes
   *     with NO sidebar (sign-in, sign-up, 404, public content). Without this,
   *     a narrow page on a sidebar-less shell pins to x=32px with a wide void.
   */
  align?: "left" | "center";
  /** Test id passthrough. */
  "data-testid"?: string;
  children?: ReactNode;
  /** Last-resort escape. */
  unsafe_className?: string;
  as?: ElementType;
}

/**
 * Top-level page container.
 *
 * Internally owns:
 *   - the horizontal gutter (`px-6` on mobile, `px-8` on lg+)
 *   - the max-width cap (variant-dependent — caps the RIGHT edge only)
 *   - vertical rhythm (`py-12` top/bottom)
 *
 * Geometry contract:
 *   - `align="left"` (default) — content starts at the left gutter. Every authed
 *     portal route uses this; the width variant only caps the RIGHT edge. This
 *     is what makes criterion 11 (PageHeader eyebrow within ±2px across all
 *     authed routes) hold: a narrow form and a wide feed share a left edge.
 *     Left-alignment is the Bloomberg-terminal aesthetic — content hugs the
 *     sidebar's left rail.
 *   - `align="center"` — content centers in the viewport. Standalone routes
 *     with no sidebar (sign-in, sign-up, 404, public content) MUST use this,
 *     or they pin to x=32px with a wide empty void.
 *
 * Route files: write `<Page variant="default"><PageHeader …/></Page>` and pass
 * sections as children. Anything else (props like padding, max-width) is an
 * anti-pattern — `unsafe_className` exists only for true escapes.
 */
export const Page = forwardRef<HTMLDivElement, PageProps>(function Page(
  { variant = "default", align = "left", children, unsafe_className, as: As = "div", ...rest },
  ref,
) {
  return (
    <As
      ref={ref}
      data-page-variant={variant}
      data-page-align={align}
      className={cx(
        "w-full px-6 py-12 lg:px-8",
        pageMaxWidth[variant],
        align === "center" && "mx-auto",
        unsafe_className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
});

// ────────────── PageHeader ──────────────

export interface PageHeaderProps {
  /** Two-digit section index, e.g. "01". Rendered as "01 // {title}". */
  section?: string;
  /** Display-text heading. */
  title?: ReactNode;
  /** Secondary subtitle/description. */
  description?: ReactNode;
  /** Right-side actions slot. */
  actions?: ReactNode;
  /** Eyebrow text override — defaults to section + title. */
  eyebrow?: ReactNode;
  children?: ReactNode;
  unsafe_className?: string;
}

export function PageHeader({
  section,
  title,
  description,
  actions,
  eyebrow,
  children,
  unsafe_className,
}: PageHeaderProps) {
  const eyebrowText =
    eyebrow ??
    (section ? (
      <>
        {section} <span aria-hidden>{"//"}</span>{" "}
        {typeof title === "string" ? title.toUpperCase() : title}
      </>
    ) : null);

  return (
    <header className={cx("mb-10 flex items-start justify-between gap-6", unsafe_className)}>
      <div className="min-w-0 flex-1">
        {eyebrowText ? (
          <span
            data-page-header-eyebrow
            data-testid="page-header-eyebrow"
            className={cx(
              "data-mono inline-block font-mono text-mono-xs uppercase",
              textColor.accent,
            )}
          >
            {eyebrowText}
          </span>
        ) : null}
        {title ? (
          <h1
            className={cx(
              "mt-3 font-display text-display-xl font-semibold leading-[1.05] tracking-tight",
              textColor.strong,
            )}
          >
            {title}
          </h1>
        ) : null}
        {description ? (
          <p className={cx("mt-3 max-w-2xl text-body-lg", textColor.muted)}>{description}</p>
        ) : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
    </header>
  );
}

// ────────────── PageBody ──────────────

export interface PageBodyProps {
  children?: ReactNode;
  unsafe_className?: string;
}

/**
 * Convenience body wrapper. Adds vertical rhythm between top-level sections.
 * Most routes don't need this — they put sections directly under `<Page>`.
 */
export function PageBody({ children, unsafe_className }: PageBodyProps) {
  return <div className={cx("flex flex-col gap-12", unsafe_className)}>{children}</div>;
}

// ────────────── PageSection ──────────────

export interface PageSectionProps {
  /** Two-digit index, e.g. "02". */
  section?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  unsafe_className?: string;
}

export function PageSection({
  section,
  title,
  description,
  actions,
  children,
  unsafe_className,
}: PageSectionProps) {
  const hasHeader = section || title || description || actions;
  return (
    <section className={cx("mt-12 first:mt-0", unsafe_className)}>
      {hasHeader ? (
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            {section ? (
              <span
                data-page-section-eyebrow
                className={cx(
                  "data-mono inline-block font-mono text-mono-xs uppercase",
                  textColor.accent,
                )}
              >
                {section} <span aria-hidden>{"//"}</span>{" "}
                {typeof title === "string" ? title.toUpperCase() : null}
              </span>
            ) : null}
            {title && !section ? (
              <h2
                className={cx(
                  "font-display text-display-md font-semibold tracking-tight",
                  textColor.strong,
                )}
              >
                {title}
              </h2>
            ) : null}
            {title && section ? (
              <h2
                className={cx(
                  "mt-2 font-display text-display-md font-semibold tracking-tight",
                  textColor.strong,
                )}
              >
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className={cx("mt-2 text-body-md", textColor.muted)}>{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

// ────────────── PageActions ──────────────

export interface PageActionsProps {
  align?: "start" | "end";
  children?: ReactNode;
  unsafe_className?: string;
}

export function PageActions({ align = "end", children, unsafe_className }: PageActionsProps) {
  return (
    <div
      className={cx(
        "mt-8 flex items-center gap-3",
        align === "end" ? "justify-end" : "justify-start",
        unsafe_className,
      )}
    >
      {children}
    </div>
  );
}

// ────────────── PageBreadcrumbs ──────────────

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageBreadcrumbsProps {
  items: BreadcrumbItem[];
  unsafe_className?: string;
}

export function PageBreadcrumbs({ items, unsafe_className }: PageBreadcrumbsProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cx("data-mono mb-4 font-mono text-mono-xs uppercase", unsafe_className)}
    >
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${it.label}-${i}`} className="flex items-center gap-2">
              {it.href && !last ? (
                <a href={it.href} className={cx("hover:underline", textColor.muted)}>
                  {it.label}
                </a>
              ) : (
                <span className={last ? textColor.strong : textColor.muted}>{it.label}</span>
              )}
              {!last ? <span className={textColor.subtle}>/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ────────────── PageEmptyState ──────────────

export interface PageEmptyStateProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: ReactNode;
}

export function PageEmptyState({ title, description, actions, icon }: PageEmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-center text-center", space.py["20"])}>
      {icon ? <div className={cx("mb-4", textColor.subtle)}>{icon}</div> : null}
      <h3 className={cx("font-display text-display-md", textColor.strong)}>{title}</h3>
      {description ? (
        <p className={cx("mt-3 max-w-md text-body-md", textColor.muted)}>{description}</p>
      ) : null}
      {actions ? <div className="mt-6 flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}

// ────────────── PageError ──────────────

export interface PageErrorProps {
  title?: string;
  message?: string;
  actions?: ReactNode;
}

export function PageError({ title = "Something went wrong", message, actions }: PageErrorProps) {
  return (
    <div role="alert" className={cx("flex flex-col items-center text-center", space.py["20"])}>
      <div
        className={cx(
          "data-mono font-mono text-mono-xs uppercase tracking-[0.2em]",
          "text-[color:var(--color-state-error)]",
        )}
      >
        ERR {"//"}
      </div>
      <h3 className={cx("mt-3 font-display text-display-md", textColor.strong)}>{title}</h3>
      {message ? (
        <p className={cx("mt-3 max-w-md text-body-md", textColor.muted)}>{message}</p>
      ) : null}
      {actions ? <div className="mt-6 flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}

// ────────────── PageLoading ──────────────

export interface PageLoadingProps {
  label?: string;
}

export function PageLoading({ label = "Loading" }: PageLoadingProps) {
  return (
    <div className={cx("flex items-center justify-center", space.py["20"])}>
      <span
        className={cx(
          "data-mono font-mono text-mono-xs uppercase tracking-[0.2em]",
          textColor.accent,
        )}
      >
        {label}...
      </span>
    </div>
  );
}
