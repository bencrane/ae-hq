import type { Meta, StoryObj } from "@storybook/react";
import { ArticleCard, ArticleCardCompact, DataDropCard, FeedRow } from "./feed";

const meta = {
  title: "Feed",
} satisfies Meta;

export default meta;

export const ArticleCardDefault: StoryObj = {
  name: "ArticleCard — default",
  render: () => (
    <div className="max-w-md">
      <ArticleCard
        kind="company_spotlight"
        title="Inside Stripe's Enterprise Motion"
        dek="How the payments giant rebuilt its enterprise sales org around outcome-based selling."
        authorName="Dana Whitfield"
        readMinutes={7}
        tags={["Stripe", "Enterprise"]}
      />
    </div>
  ),
};

export const ArticleCardWithHero: StoryObj = {
  name: "ArticleCard — with hero",
  render: () => (
    <div className="max-w-md">
      <ArticleCard
        kind="compensation_data"
        title="2026 Enterprise AE OTE Benchmarks"
        dek="We aggregated verified compensation data across 1,400 enterprise AE seats."
        authorName="AE Data Desk"
        readMinutes={8}
        heroImageUrl="https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&q=80"
        tags={["Compensation"]}
      />
    </div>
  ),
};

export const ArticleCardCompactDefault: StoryObj = {
  name: "ArticleCardCompact",
  render: () => (
    <div className="max-w-xl">
      <ArticleCardCompact
        kind="leadership_moves"
        title="VP Sales Musical Chairs: Q1 2026"
        authorName="Tom Becker"
        readMinutes={6}
      />
    </div>
  ),
};

export const DataDropCardDefault: StoryObj = {
  name: "DataDropCard",
  render: () => (
    <div className="max-w-sm">
      <DataDropCard
        metric="$285K"
        label="median enterprise AE OTE"
        caption="Across 1,400 verified seats, 2026."
        delta="+6% YoY"
      />
    </div>
  ),
};

export const FeedRowMixed: StoryObj = {
  name: "FeedRow — discriminated union",
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <FeedRow
        row={{
          type: "job",
          node: (
            <div className="rounded-xl border border-[color:var(--color-border-subtle)] px-5 py-4 text-body-sm text-[color:var(--color-text-default)]">
              Enterprise AE — Stripe (job row, route-owned markup)
            </div>
          ),
        }}
      />
      <FeedRow
        row={{
          type: "article-compact",
          kind: "company_spotlight",
          title: "Snowflake's Land-and-Expand Playbook, Decoded",
          authorName: "Marcus Reide",
          readMinutes: 6,
        }}
      />
      <FeedRow
        row={{
          type: "data-drop",
          metric: "$108K",
          label: "median realized SMB earnings",
          caption: "vs $135K posted — only 38% of SMB AEs hit quota.",
        }}
      />
    </div>
  ),
};
