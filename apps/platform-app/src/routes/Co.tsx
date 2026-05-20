import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  Page,
  PageHeader,
  Card,
  CardBody,
  CardHeader,
  Badge,
  Stat,
  Grid,
  Stack,
  SectionLabel,
} from "@ae-hq/ui";

export function Co() {
  const coQ = useQuery({
    queryKey: ["co", "me"],
    queryFn: async () => {
      const res = await api.api.v1.company.me.$get();
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });
  const billingQ = useQuery({
    queryKey: ["co", "billing"],
    queryFn: async () => {
      const res = await api.api.v1.company.billing.$get();
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  return (
    <Page>
      <PageHeader
        section="01"
        eyebrow="01 // RECRUITER_DASHBOARD"
        title={coQ.data?.company?.name ?? "Your company"}
      />

      <Grid cols={1} mdCols={2} gap="6">
        <Card>
          <CardHeader>
            <SectionLabel index={2}>HIRING</SectionLabel>
          </CardHeader>
          <CardBody>
            <div className="font-display text-body-lg text-[color:var(--color-text-strong)]">
              Job postings &amp; pipelines
            </div>
            <p className="mt-1 text-body-sm text-[color:var(--color-text-muted)]">
              Every posting with its applicant count and funnel. Open one to work its pipeline.
            </p>
            <Link
              to="/co/jobs"
              className="data-mono mt-4 inline-block font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)] hover:text-[color:var(--color-accent-primaryHover)]"
            >
              View job postings →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <SectionLabel index={3}>SUBSCRIPTION</SectionLabel>
          </CardHeader>
          <CardBody>
            <Stat
              label={`${billingQ.data?.subscription?.unlocks_used_current_period ?? 0} / ${
                billingQ.data?.subscription?.unlocks_per_month ?? 0
              } UNLOCKS`}
              value={billingQ.data?.subscription?.tier?.toUpperCase() ?? "—"}
            />
            <Link
              to="/co/billing"
              className="data-mono mt-4 inline-block font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)] hover:text-[color:var(--color-accent-primaryHover)]"
            >
              Manage →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <SectionLabel index={4}>SEARCH</SectionLabel>
          </CardHeader>
          <CardBody>
            <Link
              to="/co/candidates"
              className="data-mono inline-block font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)] hover:text-[color:var(--color-accent-primaryHover)]"
            >
              Browse candidates →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <SectionLabel index={5}>INTEGRATIONS</SectionLabel>
          </CardHeader>
          <CardBody>
            <Stack gap="2">
              <Link
                to="/co/ats"
                className="data-mono inline-block font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)] hover:text-[color:var(--color-accent-primaryHover)]"
              >
                Connect ATS →
              </Link>
              <Link
                to="/co/company"
                className="data-mono inline-block font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-accent)]"
              >
                Company details →
              </Link>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <div className="mt-12">
        <Badge tone="good">{">"} ACTIVE SUBSCRIPTION</Badge>
      </div>
    </Page>
  );
}
