/**
 * Feed primitives — the Bloomberg-texture browse surface.
 *
 * `FeedRow` is a discriminated-union renderer: a feed is a list of rows, each
 * `{ kind: "job" | "article" | "data-drop", ... }`, and FeedRow dispatches to
 * the right card. `ArticleCard` / `ArticleCardCompact` render Carrying Quota
 * editorial; `DataDropCard` renders a compensation-data callout.
 *
 * Cards take a render-prop `as` wrapper so routes can wrap them in a router
 * `<Link>` without the primitive depending on react-router.
 */

import { type ReactNode } from "react";
import { Badge } from "./display";
import { cx, textColor } from "./utils";

type LinkWrap = (props: { className: string; children: ReactNode }) => ReactNode;

// ────────────── ArticleCard ──────────────

export interface ArticleCardProps {
  kind: "company_spotlight" | "compensation_data" | "leadership_moves";
  title: string;
  dek?: string | null;
  authorName?: string | null;
  readMinutes?: number | null;
  heroImageUrl?: string | null;
  tags?: ReadonlyArray<string>;
  /** Router-link wrapper. */
  as?: LinkWrap;
}

const KIND_LABEL: Record<ArticleCardProps["kind"], string> = {
  company_spotlight: "Company Spotlight",
  compensation_data: "Compensation Data",
  leadership_moves: "Leadership Moves",
};

export function ArticleCard({
  kind,
  title,
  dek,
  authorName,
  readMinutes,
  heroImageUrl,
  tags,
  as,
}: ArticleCardProps) {
  const className = cx(
    "group block overflow-hidden rounded-xl border transition-colors",
    "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised-translucent)]",
    "hover:border-[color:var(--color-border-default)]",
  );
  const inner = (
    <>
      {heroImageUrl ? (
        <img
          src={heroImageUrl}
          alt=""
          className="h-44 w-full border-b border-[color:var(--color-border-subtle)] object-cover"
        />
      ) : null}
      <div className="flex flex-col gap-3 px-6 py-5">
        <div className="flex items-center gap-2">
          <Badge tone="info">{KIND_LABEL[kind]}</Badge>
          {typeof readMinutes === "number" ? (
            <span className={cx("data-mono font-mono text-mono-xs uppercase", textColor.subtle)}>
              {readMinutes} min read
            </span>
          ) : null}
        </div>
        <h3
          className={cx(
            "font-display text-display-sm font-semibold leading-tight",
            textColor.strong,
          )}
        >
          {title}
        </h3>
        {dek ? <p className={cx("text-body-sm", textColor.muted)}>{dek}</p> : null}
        <div className="flex items-center justify-between gap-3">
          {authorName ? (
            <span className={cx("data-mono font-mono text-mono-xs uppercase", textColor.subtle)}>
              By {authorName}
            </span>
          ) : (
            <span />
          )}
          {tags && tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((t) => (
                <Badge key={t} tone="muted">
                  {t}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
  return as ? as({ className, children: inner }) : <div className={className}>{inner}</div>;
}

// ────────────── ArticleCardCompact ──────────────

export interface ArticleCardCompactProps {
  kind: ArticleCardProps["kind"];
  title: string;
  authorName?: string | null;
  readMinutes?: number | null;
  as?: LinkWrap;
}

/** A dense, image-less article row — used to interleave into the job feed. */
export function ArticleCardCompact({
  kind,
  title,
  authorName,
  readMinutes,
  as,
}: ArticleCardCompactProps) {
  const className = cx(
    "group flex items-start gap-4 rounded-xl border px-5 py-4 transition-colors",
    "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised-translucent)]",
    "hover:border-[color:var(--color-border-default)]",
  );
  const inner = (
    <>
      <span
        aria-hidden
        className={cx(
          "mt-0.5 data-mono shrink-0 font-mono text-mono-xs uppercase tracking-[0.2em]",
          textColor.accent,
        )}
      >
        CQ
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge tone="info">{KIND_LABEL[kind]}</Badge>
          {typeof readMinutes === "number" ? (
            <span className={cx("data-mono font-mono text-mono-xs uppercase", textColor.subtle)}>
              {readMinutes} min
            </span>
          ) : null}
        </div>
        <div className={cx("mt-1.5 font-display text-body-lg font-medium leading-snug", textColor.strong)}>
          {title}
        </div>
        {authorName ? (
          <div className={cx("data-mono mt-1 font-mono text-mono-xs uppercase", textColor.subtle)}>
            Carrying Quota {"//"} {authorName}
          </div>
        ) : null}
      </div>
    </>
  );
  return as ? as({ className, children: inner }) : <div className={className}>{inner}</div>;
}

// ────────────── DataDropCard ──────────────

export interface DataDropCardProps {
  /** Headline metric, e.g. "$285K". */
  metric: string;
  /** What the metric measures. */
  label: string;
  /** Short supporting line. */
  caption?: string;
  /** Optional delta chip. */
  delta?: string;
  as?: LinkWrap;
}

/** A compensation-data callout — a numeric "drop" in the feed. */
export function DataDropCard({ metric, label, caption, delta, as }: DataDropCardProps) {
  const className = cx(
    "group flex flex-col gap-2 rounded-xl border px-6 py-5 transition-colors",
    "border-[color:var(--color-border-accent)] bg-[color:var(--color-accent-softer)]",
    "hover:border-[color:var(--color-accent-primary)]",
  );
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <span className={cx("data-mono font-mono text-mono-xs uppercase tracking-[0.2em]", textColor.accent)}>
          {">"}_ DATA DROP
        </span>
        {delta ? <Badge tone="good">{delta}</Badge> : null}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cx("font-mono text-display-lg font-semibold tabular-nums", textColor.strong)}>
          {metric}
        </span>
        <span className={cx("data-mono font-mono text-mono-sm uppercase", textColor.muted)}>
          {label}
        </span>
      </div>
      {caption ? <p className={cx("text-body-sm", textColor.muted)}>{caption}</p> : null}
    </>
  );
  return as ? as({ className, children: inner }) : <div className={className}>{inner}</div>;
}

// ────────────── FeedRow — discriminated-union renderer ──────────────

// The union discriminant is `type` (not `kind`) — `kind` is already an
// article-classification field on ArticleCardProps and would collide.
export type FeedRowData =
  | { type: "job"; node: ReactNode }
  | ({ type: "article" } & ArticleCardProps)
  | ({ type: "article-compact" } & ArticleCardCompactProps)
  | ({ type: "data-drop" } & DataDropCardProps);

export interface FeedRowProps {
  row: FeedRowData;
}

/**
 * Renders one feed row. A job row carries a pre-built `node` (the route owns
 * job-card markup); article / data-drop rows are rendered by the matching
 * primitive. This is the single dispatch point for the interleaved feed.
 */
export function FeedRow({ row }: FeedRowProps) {
  switch (row.type) {
    case "job":
      return <>{row.node}</>;
    case "article": {
      const { type: _t, ...props } = row;
      return <ArticleCard {...props} />;
    }
    case "article-compact": {
      const { type: _t, ...props } = row;
      return <ArticleCardCompact {...props} />;
    }
    case "data-drop": {
      const { type: _t, ...props } = row;
      return <DataDropCard {...props} />;
    }
  }
}
