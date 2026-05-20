import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  Page,
  PageHeader,
  PageSection,
  Card,
  CardBody,
  CardHeader,
  Badge,
  Button,
  Grid,
  Inline,
  PageLoading,
  PageError,
  PageEmptyState,
} from "@ae-hq/ui";

type JobRow = {
  id: string;
  title: string;
  segment: string;
  stage: string;
  location: string;
  is_remote: boolean;
  ote_min: number;
  ote_max: number;
  company: { id: string; name: string; logo_url: string | null } | null;
};
type JobsResponse = { jobs: JobRow[]; total: number };

export function Home() {
  const jobsQ = useQuery({
    queryKey: ["jobs", "home"],
    queryFn: async (): Promise<JobsResponse> => {
      const res = await api.api.v1.jobs.$get({ query: { limit: "20" } });
      if (!res.ok) throw new Error("failed to load jobs");
      return (await res.json()) as unknown as JobsResponse;
    },
  });

  return (
    <Page variant="wide" align="center">
      <PageHeader
        section="01"
        eyebrow="01 // MARKETPLACE"
        title={
          <>
            The market for{" "}
            <span className="text-[color:var(--color-text-accent)]">Account Executives</span> who
            already know how to sell.
          </>
        }
        description="Verified attainment. Real deal sizes. Real tenure. No more games."
        actions={
          <Inline gap="3">
            <Link to="/signup">
              <Button size="lg">Get started</Button>
            </Link>
            <Link to="/signin">
              <Button variant="secondary" size="lg">
                Sign in
              </Button>
            </Link>
          </Inline>
        }
      />

      <PageSection
        section="02"
        title="Latest jobs"
        actions={<Badge tone="muted">{jobsQ.data?.total ?? 0} TOTAL</Badge>}
      >
        {jobsQ.isLoading ? (
          <PageLoading />
        ) : jobsQ.isError ? (
          <PageError message="ERR // failed to load jobs" />
        ) : !jobsQ.data || jobsQ.data.jobs.length === 0 ? (
          <PageEmptyState title="No jobs yet" />
        ) : (
          <Grid cols={1} mdCols={2} gap="4">
            {jobsQ.data.jobs.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`}>
                <Card interactive className="h-full">
                  <CardHeader className="flex items-center gap-3">
                    {j.company?.logo_url ? (
                      <img
                        src={j.company.logo_url}
                        alt=""
                        className="h-8 w-8 rounded border border-[color:var(--color-border-subtle)]"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]" />
                    )}
                    <div className="flex-1">
                      <div className="font-display text-body-lg leading-tight">{j.title}</div>
                      <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
                        {j.company?.name} {"//"} {j.location}
                      </div>
                    </div>
                  </CardHeader>
                  <CardBody>
                    <Inline gap="2" wrap>
                      <Badge tone="good">
                        ${Math.round(j.ote_min / 1000)}K–${Math.round(j.ote_max / 1000)}K OTE
                      </Badge>
                      <Badge>{j.segment}</Badge>
                      <Badge>{j.stage}</Badge>
                      {j.is_remote ? <Badge tone="muted">REMOTE</Badge> : null}
                    </Inline>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </Grid>
        )}
      </PageSection>
    </Page>
  );
}
