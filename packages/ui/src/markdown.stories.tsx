import type { Meta, StoryObj } from "@storybook/react";
import { Markdown } from "./markdown";

const meta = {
  title: "Markdown",
} satisfies Meta;

export default meta;

const SAMPLE = `## The shift

Stripe spent 2025 quietly **re-architecting** its enterprise go-to-market.

### What changed

- Quotas moved from logo count to *net revenue retention*.
- Every enterprise AE pairs with a solutions architect.
- Deal desks were given veto power on discounting.

> We stopped rewarding the close and started rewarding the expansion.

| Stage | Median OTE |
|-------|-----------|
| Series B | $245K |
| Public | $310K |

Read more at [the data desk](https://accountexecutive.com).`;

export const MarkdownDefault: StoryObj = {
  name: "Markdown — article body",
  render: () => (
    <div className="max-w-2xl">
      <Markdown source={SAMPLE} />
    </div>
  ),
};

// Demonstrates the safe-by-construction contract: raw HTML renders as inert
// literal text — no script executes, no element is injected.
const HOSTILE = `## Safety check

A crafted body should render inert:

<script>alert('xss')</script>

<img src=x onerror="alert('xss')">

[click me](javascript:alert('xss'))`;

export const MarkdownSanitized: StoryObj = {
  name: "Markdown — hostile input renders inert",
  render: () => (
    <div className="max-w-2xl">
      <Markdown source={HOSTILE} />
    </div>
  ),
};
