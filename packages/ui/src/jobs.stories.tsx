import type { Meta, StoryObj } from "@storybook/react";
import {
  CollectionRow,
  CollectionSection,
  CompanyProfileHeader,
  FunnelSummary,
  JobCard,
} from "./jobs";

const meta = {
  title: "Jobs",
} satisfies Meta;

export default meta;

export const JobCardDefault: StoryObj = {
  name: "JobCard",
  render: () => (
    <div className="max-w-md">
      <JobCard
        title="Enterprise AE — Stripe"
        companyName="Stripe"
        location="San Francisco, CA"
        segment="Enterprise"
        stage="Public"
        isRemote
        oteMin={280000}
        oteMax={340000}
      />
    </div>
  ),
};

export const JobCardApplied: StoryObj = {
  name: "JobCard — applied",
  render: () => (
    <div className="max-w-md">
      <JobCard
        title="Mid-Market AE — Linear"
        companyName="Linear"
        location="Remote"
        segment="MidMarket"
        stage="SeriesB"
        isRemote
        oteMin={180000}
        oteMax={230000}
        applied
      />
    </div>
  ),
};

export const CollectionRowDefault: StoryObj = {
  name: "CollectionRow",
  render: () => (
    <CollectionRow>
      <JobCard
        title="Enterprise AE — Snowflake"
        companyName="Snowflake"
        location="Bozeman, MT"
        segment="Enterprise"
        oteMin={290000}
        oteMax={350000}
        width="fixed"
      />
      <JobCard
        title="Enterprise AE — Datadog"
        companyName="Datadog"
        location="New York, NY"
        segment="Enterprise"
        oteMin={270000}
        oteMax={330000}
        width="fixed"
      />
    </CollectionRow>
  ),
};

export const CollectionSectionDefault: StoryObj = {
  name: "CollectionSection",
  render: () => (
    <CollectionSection
      title="PLG companies hiring AEs"
      subtitle="Product-led growth — the product lands itself; you expand it."
    >
      <JobCard
        title="Enterprise AE — Vercel"
        companyName="Vercel"
        location="San Francisco, CA"
        segment="Enterprise"
        oteMin={250000}
        oteMax={310000}
        width="fixed"
      />
      <JobCard
        title="Mid-Market AE — Supabase"
        companyName="Supabase"
        location="Remote"
        segment="MidMarket"
        isRemote
        oteMin={180000}
        oteMax={230000}
        width="fixed"
      />
    </CollectionSection>
  ),
};

export const FunnelSummaryDefault: StoryObj = {
  name: "FunnelSummary",
  render: () => (
    <FunnelSummary
      stages={[
        { stageName: "New", count: 8, color: "info" },
        { stageName: "Reviewing", count: 5, color: "default" },
        { stageName: "Phone Screen", count: 3, color: "warn" },
        { stageName: "Onsite", count: 2, color: "accent" },
        { stageName: "Offer", count: 1, color: "good" },
        { stageName: "Closed", count: 0, color: "muted" },
      ]}
    />
  ),
};

export const CompanyProfileHeaderDefault: StoryObj = {
  name: "CompanyProfileHeader",
  render: () => (
    <CompanyProfileHeader
      name="Stripe"
      description="Stripe builds economic infrastructure for the internet."
      facts={[
        { label: "HQ", value: "San Francisco, CA" },
        { label: "Founded", value: "2010" },
        { label: "Headcount", value: "8,500" },
        { label: "Stage", value: "Public" },
        { label: "Sales motion", value: "Hybrid" },
      ]}
    />
  ),
};
