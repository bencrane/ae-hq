import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  KVTable,
  Pagination,
  SectionLabel,
  Spinner,
  Stat,
} from "./display";

const meta = {
  title: "Display",
} satisfies Meta;

export default meta;

export const CardDefault: StoryObj = {
  name: "Card — default",
  render: () => (
    <Card>
      <CardHeader>
        <SectionLabel index={1}>PROFILE</SectionLabel>
      </CardHeader>
      <CardBody>candidate@accountexecutive.test</CardBody>
    </Card>
  ),
};

export const CardRaised: StoryObj = {
  name: "Card — raised",
  render: () => (
    <Card variant="raised">
      <CardBody>raised variant</CardBody>
    </Card>
  ),
};

export const BadgeDefault: StoryObj = {
  name: "Badge — tones",
  render: () => (
    <div className="flex gap-2">
      <Badge>DEFAULT</Badge>
      <Badge tone="good">GOOD</Badge>
      <Badge tone="warn">WARN</Badge>
      <Badge tone="muted">MUTED</Badge>
      <Badge tone="info">INFO</Badge>
    </div>
  ),
};

export const AvatarDefault: StoryObj = {
  name: "Avatar — initials",
  render: () => <Avatar initials="AE" />,
};

export const AvatarImage: StoryObj = {
  name: "Avatar — image",
  render: () => (
    <Avatar
      src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=128"
      alt="Sample"
      size="md"
    />
  ),
};

export const StatDefault: StoryObj = {
  name: "Stat — default",
  render: () => <Stat label="ATTAINMENT" value="142" unit="%" delta={{ value: "+12 vs Q3" }} />,
};

export const KVTableDefault: StoryObj = {
  name: "KVTable",
  render: () => (
    <KVTable
      rows={[
        { label: "Email", value: "x@y.com" },
        { label: "Segment", value: "Mid-market" },
        { label: "Methodology", value: "MEDDIC + Challenger" },
      ]}
    />
  ),
};

export const DataTableDefault: StoryObj = {
  name: "DataTable",
  render: () => (
    <DataTable
      columns={[
        { key: "name", label: "Name" },
        { key: "ote", label: "OTE", align: "right", mono: true },
        { key: "stage", label: "Stage" },
      ]}
      rows={[
        { name: "AE @ Stripe", ote: "$210K", stage: "Series A→IPO" },
        { name: "AE @ Snowflake", ote: "$240K", stage: "IPO" },
      ]}
    />
  ),
};

export const PaginationDefault: StoryObj = {
  name: "Pagination",
  render: () => {
    const [p, set] = useState(2);
    return <Pagination page={p} pageSize={20} total={147} onPageChange={set} />;
  },
};

export const SpinnerDefault: StoryObj = {
  name: "Spinner",
  render: () => <Spinner />,
};

export const SectionLabelDefault: StoryObj = {
  name: "SectionLabel",
  render: () => <SectionLabel index={3}>WORK_HISTORY</SectionLabel>,
};

export const ButtonVariants: StoryObj = {
  name: "Button — variants",
  render: () => (
    <div className="flex gap-3">
      <Button>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
    </div>
  ),
};

export const ButtonSizes: StoryObj = {
  name: "Button — sizes",
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const ButtonDisabled: StoryObj = {
  name: "Button — disabled",
  render: () => (
    <div className="flex gap-3">
      <Button disabled>Disabled</Button>
      <Button variant="secondary" disabled>
        Disabled
      </Button>
    </div>
  ),
};
