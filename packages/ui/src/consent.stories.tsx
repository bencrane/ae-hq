import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  Toggle,
  MatchStatusBadge,
  AnonymousCandidateCard,
  type MatchStatus,
} from "./consent";
import { Button } from "./display";

const meta = {
  title: "Consent",
} satisfies Meta;

export default meta;

// ── Toggle ──────────────────────────────────────────────────────────────────

export const ToggleDefault: StoryObj = {
  name: "Toggle — auto-match setting",
  render: () => {
    const [on, setOn] = useState(true);
    return (
      <div className="max-w-md">
        <Toggle
          id="story-auto-match"
          checked={on}
          onChange={setOn}
          label="Auto-open a conversation"
          description="When a company that fits your criteria wants to talk, connect automatically — no approval step."
        />
      </div>
    );
  },
};

export const ToggleOff: StoryObj = {
  name: "Toggle — off + disabled",
  render: () => (
    <div className="flex max-w-md flex-col gap-4">
      <Toggle
        id="story-toggle-off"
        checked={false}
        onChange={() => {}}
        label="Let companies discover you"
        description="Companies whose hiring fits your criteria can find your anonymized profile."
      />
      <Toggle
        id="story-toggle-disabled"
        checked
        onChange={() => {}}
        disabled
        label="Disabled toggle"
        description="A toggle in a disabled state."
      />
    </div>
  ),
};

// ── MatchStatusBadge ────────────────────────────────────────────────────────

export const MatchStatusBadgeAll: StoryObj = {
  name: "MatchStatusBadge — every status",
  render: () => {
    const statuses: MatchStatus[] = [
      "resolved",
      "pending_ae",
      "pending_company",
      "declined",
      "expired",
    ];
    return (
      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <MatchStatusBadge key={s} status={s} />
        ))}
      </div>
    );
  },
};

// ── AnonymousCandidateCard ──────────────────────────────────────────────────

export const AnonymousCandidateCardDefault: StoryObj = {
  name: "AnonymousCandidateCard — discovery card",
  render: () => (
    <div className="max-w-2xl">
      <AnonymousCandidateCard
        initials="AE"
        headline="Enterprise AE — 7yrs closing $100K+ ACV in fintech"
        yearsExperience={7}
        segmentFocus="Enterprise"
        salesMotionLabel="Enterprise sales"
        workedAtCompanies={[
          { id: "1", name: "Stripe" },
          { id: "2", name: "Plaid" },
          { id: "3", name: "Datadog" },
        ]}
        action={
          <Button size="sm" variant="primary">
            Express interest
          </Button>
        }
      />
    </div>
  ),
};

export const AnonymousCandidateCardClickable: StoryObj = {
  name: "AnonymousCandidateCard — clickable, no work history",
  render: () => (
    <div className="max-w-2xl">
      <AnonymousCandidateCard
        initials="MM"
        headline="Mid-Market AE — 4yrs in devtools"
        yearsExperience={4}
        segmentFocus="MidMarket"
        salesMotionLabel="Hybrid sales motion"
        workedAtCompanies={[]}
        onClick={() => {}}
      />
    </div>
  ),
};
