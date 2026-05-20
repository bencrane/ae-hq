import type { Meta, StoryObj } from "@storybook/react";
import { Button, Card, CardBody, CardHeader, SectionLabel } from "./display";
import {
  Page,
  PageActions,
  PageBody,
  PageBreadcrumbs,
  PageEmptyState,
  PageError,
  PageHeader,
  PageLoading,
  PageSection,
} from "./page";

const meta = {
  title: "Page",
} satisfies Meta;

export default meta;

export const Default: StoryObj = {
  name: "Page — default",
  render: () => (
    <Page>
      <PageHeader
        section="01"
        title="Candidate dashboard"
        description="Verified attainment. Real deal sizes."
      />
      <PageBody>
        <PageSection section="02" title="Profile">
          <Card>
            <CardHeader>
              <SectionLabel index={1}>EMAIL</SectionLabel>
            </CardHeader>
            <CardBody>candidate@accountexecutive.test</CardBody>
          </Card>
        </PageSection>
      </PageBody>
    </Page>
  ),
};

export const NarrowVariant: StoryObj = {
  name: "Page — narrow",
  render: () => (
    <Page variant="narrow">
      <PageHeader section="01" title="Sign in" />
      <Card>
        <CardBody>narrow form lives here</CardBody>
      </Card>
    </Page>
  ),
};

export const WideVariant: StoryObj = {
  name: "Page — wide",
  render: () => (
    <Page variant="wide">
      <PageHeader section="01" title="Marketplace" />
      <p>Wide variant — used by Home / CoCandidates.</p>
    </Page>
  ),
};

export const HeaderWithActions: StoryObj = {
  name: "PageHeader — with actions",
  render: () => (
    <Page>
      <PageHeader
        section="01"
        title="Candidates"
        description="Browse anonymized AEs."
        actions={
          <>
            <Button variant="ghost" size="sm">
              Reset
            </Button>
            <Button size="sm">Apply</Button>
          </>
        }
      />
    </Page>
  ),
};

export const Breadcrumbs: StoryObj = {
  name: "PageBreadcrumbs",
  render: () => (
    <Page>
      <PageBreadcrumbs
        items={[{ label: "Candidates", href: "/co/candidates" }, { label: "Detail" }]}
      />
      <PageHeader section="01" title="Anonymized #abc" />
    </Page>
  ),
};

export const EmptyState: StoryObj = {
  name: "PageEmptyState",
  render: () => (
    <Page>
      <PageEmptyState
        title="No credentials yet"
        description="Upload a CSV or connect Plaid to begin."
        actions={<Button>Upload CSV</Button>}
      />
    </Page>
  ),
};

export const ErrorState: StoryObj = {
  name: "PageError",
  render: () => (
    <Page>
      <PageError
        title="Could not load"
        message="Network request failed. Retry?"
        actions={<Button>Retry</Button>}
      />
    </Page>
  ),
};

export const Loading: StoryObj = {
  name: "PageLoading",
  render: () => (
    <Page>
      <PageLoading />
    </Page>
  ),
};

export const Actions: StoryObj = {
  name: "PageActions",
  render: () => (
    <Page variant="narrow">
      <PageHeader section="01" title="Edit profile" />
      <Card>
        <CardBody>form fields here</CardBody>
      </Card>
      <PageActions>
        <Button variant="ghost">Cancel</Button>
        <Button>Save changes</Button>
      </PageActions>
    </Page>
  ),
};

export const Section: StoryObj = {
  name: "PageSection",
  render: () => (
    <Page>
      <PageHeader section="01" title="Settings" />
      <PageSection section="02" title="Notifications">
        <Card>
          <CardBody>contents</CardBody>
        </Card>
      </PageSection>
      <PageSection section="03" title="Security">
        <Card>
          <CardBody>contents</CardBody>
        </Card>
      </PageSection>
    </Page>
  ),
};
