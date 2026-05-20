import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import {
  Page,
  PageHeader,
  PageLoading,
  PageError,
  Card,
  CardBody,
  CardHeader,
  Badge,
  SectionLabel,
  Grid,
  Inline,
} from "@ae-hq/ui";

type JobDetailShape = {
  job: {
    id: string;
    title: string;
    segment: string;
    stage: string;
    location: string;
    is_remote: boolean;
    ote_min: number;
    ote_max: number;
    base_min: number;
    base_max: number;
    deal_size_avg: number;
    sales_cycle_days: number;
    methodology: string | null;
    stack: string[];
    company: {
      id: string;
      slug: string;
      name: string;
      logo_url: string | null;
      hq_location: string | null;
    };
  };
};

export function JobDetail() {
  const { id = "" } = useParams();
  const q = useQuery({
    queryKey: ["job", id],
    queryFn: async (): Promise<JobDetailShape | null> => {
      const res = await api.api.v1.jobs[":id"].$get({ param: { id } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as unknown as JobDetailShape;
    },
  });

  if (q.isLoading) {
    return (
      <Page align="center">
        <PageLoading />
      </Page>
    );
  }
  if (!q.data || !("job" in q.data)) {
    return (
      <Page align="center">
        <PageError
          title="Job not found"
          actions={
            <Link
              to="/"
              className="data-mono inline-block font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)]"
            >
              ← Back to jobs
            </Link>
          }
        />
      </Page>
    );
  }
  const job = q.data.job;
  const company = job.company;

  return (
    <Page align="center">
      <PageHeader
        section="01"
        eyebrow="01 // OPEN ROLE"
        title={
          <Inline gap="6" align="start">
            {company.logo_url ? (
              <img
                src={company.logo_url}
                alt=""
                className="h-16 w-16 rounded-xl border border-[color:var(--color-border-subtle)]"
              />
            ) : (
              <div className="h-16 w-16 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]" />
            )}
            <div>
              <span className="font-display text-display-xl font-semibold leading-tight">
                {job.title}
              </span>
              <Link
                to={`/companies/${company.slug}`}
                className="data-mono mt-2 inline-block font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)] hover:text-[color:var(--color-accent-primaryHover)]"
              >
                {company.name} {"//"} {company.hq_location}
              </Link>
            </div>
          </Inline>
        }
      />

      <Grid cols={1} mdCols={3} gap="4">
        <Card>
          <CardHeader>
            <SectionLabel index={2}>COMP</SectionLabel>
          </CardHeader>
          <CardBody>
            <div className="data-mono font-mono text-display-md font-semibold">
              ${Math.round(job.ote_min / 1000)}K–${Math.round(job.ote_max / 1000)}K
            </div>
            <div className="data-mono mt-1 font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
              OTE
            </div>
            <div className="data-mono mt-3 font-mono text-body-sm text-[color:var(--color-text-muted)]">
              Base ${Math.round(job.base_min / 1000)}K–${Math.round(job.base_max / 1000)}K
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <SectionLabel index={3}>DEAL_SHAPE</SectionLabel>
          </CardHeader>
          <CardBody>
            <div className="data-mono font-mono text-display-md font-semibold">
              ${Math.round(job.deal_size_avg / 1000)}K
            </div>
            <div className="data-mono mt-1 font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
              AVG DEAL
            </div>
            <div className="data-mono mt-3 font-mono text-body-sm text-[color:var(--color-text-muted)]">
              {job.sales_cycle_days}d cycle
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <SectionLabel index={4}>FIT</SectionLabel>
          </CardHeader>
          <CardBody>
            <Inline gap="2" wrap>
              <Badge>{job.segment}</Badge>
              <Badge>{job.stage}</Badge>
              {job.methodology ? <Badge>{job.methodology}</Badge> : null}
              {job.is_remote ? <Badge tone="good">REMOTE</Badge> : null}
            </Inline>
            <div className="data-mono mt-3 font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
              Stack: {job.stack.join(", ")}
            </div>
          </CardBody>
        </Card>
      </Grid>
    </Page>
  );
}
