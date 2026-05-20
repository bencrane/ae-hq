/**
 * Jobs primitives (cycle 5) — the building blocks for in-portal job discovery,
 * curated collections, the per-job funnel summary, and the company profile.
 *
 * - `JobCard`             — a job card (portal variant). Shows applied-state.
 * - `CollectionSection`   — a titled section wrapping a row of job cards.
 * - `CollectionRow`       — the horizontal-scrolling card strip itself.
 * - `FunnelSummary`       — the compact per-stage bar for the jobs overview.
 * - `CompanyProfileHeader`— the company profile masthead (logo + firmographics).
 *
 * Token-typed; geometry uses the design-token scale. Storybook stories live in
 * `jobs.stories.tsx`.
 */

import type { ReactNode } from "react";
import { Badge } from "./display";
import { cx, textColor } from "./utils";

// ────────────── JobCard ──────────────

export interface JobCardProps {
  title: string;
  companyName: string;
  companyLogoUrl?: string | null;
  location: string;
  segment: string;
  stage?: string | null;
  isRemote?: boolean;
  oteMin: number;
  oteMax: number;
  /** Whether the signed-in candidate has applied to this job. */
  applied?: boolean;
  /** Width behaviour — "fill" for a grid cell, "fixed" for a collection strip. */
  width?: "fill" | "fixed";
  /** Click handler — the consumer navigates (SPA) to the job detail. */
  onClick?: () => void;
}

/**
 * A job card for the in-portal browse and collections. Renders as a `<button>`
 * (the consumer navigates on click via the router). Carries
 * `data-testid="job-card"` and `data-applied` so the portal-surfaces verifier
 * can find cards and read applied-state.
 */
export function JobCard({
  title,
  companyName,
  companyLogoUrl,
  location,
  segment,
  stage,
  isRemote,
  oteMin,
  oteMax,
  applied,
  width = "fill",
  onClick,
}: JobCardProps) {
  return (
    <button
      type="button"
      data-testid="job-card"
      data-applied={applied ? "true" : "false"}
      onClick={onClick}
      className={cx(
        "flex flex-col rounded-xl border px-5 py-4 text-left transition-colors",
        "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised-translucent)]",
        "hover:border-[color:var(--color-border-default)]",
        "focus-visible:outline-2 focus-visible:outline-[color:var(--color-border-accent)]",
        width === "fixed" ? "w-[320px] shrink-0" : "w-full",
      )}
    >
      <div className="flex w-full items-start gap-3">
        {companyLogoUrl ? (
          <img
            src={companyLogoUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded border border-[color:var(--color-border-subtle)]"
          />
        ) : (
          <div className="h-9 w-9 shrink-0 rounded border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]" />
        )}
        <div className="min-w-0 flex-1">
          <div className={cx("truncate font-display text-body-lg leading-tight", textColor.strong)}>
            {title}
          </div>
          <div className={cx("data-mono truncate font-mono text-mono-xs uppercase", textColor.muted)}>
            {companyName} {"//"} {location}
          </div>
        </div>
        {applied ? <Badge tone="good">APPLIED</Badge> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="good">
          ${Math.round(oteMin / 1000)}K–${Math.round(oteMax / 1000)}K OTE
        </Badge>
        <Badge>{segment}</Badge>
        {stage ? <Badge>{stage}</Badge> : null}
        {isRemote ? <Badge tone="muted">REMOTE</Badge> : null}
      </div>
    </button>
  );
}

// ────────────── CollectionRow ──────────────

export interface CollectionRowProps {
  children?: ReactNode;
}

/**
 * A horizontal-scrolling strip of job cards. Owns its own overflow region so
 * the collection scrolls within itself, not the page.
 */
export function CollectionRow({ children }: CollectionRowProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {children}
    </div>
  );
}

// ────────────── CollectionSection ──────────────

export interface CollectionSectionProps {
  /** The collection's curation axis title — e.g. "PLG companies hiring AEs". */
  title: string;
  /** A one-line description of the axis. */
  subtitle?: string;
  children?: ReactNode;
}

/**
 * A titled collection: an eyebrow-styled heading + a `CollectionRow` of cards.
 * Carries `data-testid="job-collection"` and tags the title for the
 * portal-surfaces verifier.
 */
export function CollectionSection({ title, subtitle, children }: CollectionSectionProps) {
  return (
    <section data-testid="job-collection" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3
          data-testid="job-collection-title"
          className={cx("font-display text-display-sm font-semibold tracking-tight", textColor.strong)}
        >
          {title}
        </h3>
        {subtitle ? (
          <p className={cx("text-body-sm", textColor.muted)}>{subtitle}</p>
        ) : null}
      </div>
      <CollectionRow>{children}</CollectionRow>
    </section>
  );
}

// ────────────── FunnelSummary ──────────────

export interface FunnelStageDatum {
  stageName: string;
  count: number;
  /** Token color name for the stage's accent. */
  color?: string;
}

export interface FunnelSummaryProps {
  stages: FunnelStageDatum[];
}

// Stage color token -> a small accent class for the funnel segment.
const FUNNEL_ACCENT: Record<string, string> = {
  info: "bg-[color:var(--color-state-info)]",
  good: "bg-[color:var(--color-accent-primary)]",
  warn: "bg-[color:var(--color-state-warn)]",
  accent: "bg-[color:var(--color-accent-primary)]",
  muted: "bg-[color:var(--color-text-subtle)]",
  default: "bg-[color:var(--color-border-strong)]",
};

/**
 * A compact per-stage breakdown for the company jobs overview — one small
 * labelled segment per pipeline stage, showing how many applicants sit at each.
 * Carries `data-testid="co-job-funnel"`.
 */
export function FunnelSummary({ stages }: FunnelSummaryProps) {
  return (
    <div data-testid="co-job-funnel" className="flex flex-wrap items-center gap-3">
      {stages.map((s, i) => (
        <div key={`${s.stageName}-${i}`} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cx(
              "h-2 w-2 rounded-full",
              FUNNEL_ACCENT[s.color ?? "default"] ?? FUNNEL_ACCENT.default,
            )}
          />
          <span className={cx("data-mono font-mono text-mono-xs uppercase", textColor.muted)}>
            {s.stageName}
          </span>
          <span className={cx("data-mono font-mono text-mono-xs font-semibold", textColor.strong)}>
            {s.count}
          </span>
        </div>
      ))}
    </div>
  );
}

// ────────────── CompanyProfileHeader ──────────────

export interface CompanyProfileFact {
  label: string;
  value: string;
}

export interface CompanyProfileHeaderProps {
  name: string;
  logoUrl?: string | null;
  description?: string | null;
  /** A row of compact firmographic facts — HQ, founded, headcount, stage, etc. */
  facts: CompanyProfileFact[];
}

/**
 * The company profile masthead — logo, name, description, and a row of compact
 * firmographic facts. Used by `/companies/:slug`.
 */
export function CompanyProfileHeader({
  name,
  logoUrl,
  description,
  facts,
}: CompanyProfileHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-5">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="h-20 w-20 shrink-0 rounded-xl border border-[color:var(--color-border-subtle)]"
          />
        ) : (
          <div className="h-20 w-20 shrink-0 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]" />
        )}
        <div className="min-w-0 flex-1">
          <h1
            className={cx(
              "font-display text-display-xl font-semibold tracking-tight",
              textColor.strong,
            )}
          >
            {name}
          </h1>
          {description ? (
            <p className={cx("mt-2 max-w-2xl text-body-md", textColor.muted)}>{description}</p>
          ) : null}
        </div>
      </div>
      {facts.length > 0 ? (
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          {facts.map((f) => (
            <div key={f.label} className="flex flex-col gap-0.5">
              <dt className={cx("data-mono font-mono text-mono-xs uppercase", textColor.subtle)}>
                {f.label}
              </dt>
              <dd className={cx("text-body-sm font-medium", textColor.strong)}>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
