import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { CompanyJobRow } from "@ae-hq/shared";
import {
  Page,
  PageHeader,
  PageLoading,
  PageError,
  PageEmptyState,
  Card,
  CardBody,
  Badge,
  Stack,
  Inline,
  FunnelSummary,
} from "@ae-hq/ui";
import { api } from "../lib/api";

type CompanyJobsResponse = { jobs: CompanyJobRow[] };

export function CoJobs() {
  const jobsQ = useQuery({
    queryKey: ["co-jobs"],
    queryFn: async (): Promise<CompanyJobsResponse> => {
      const res = await api.api.v1.company.jobs.$get();
      if (!res.ok) throw new Error("failed to load company jobs");
      return (await res.json()) as unknown as CompanyJobsResponse;
    },
  });

  const jobs = jobsQ.data?.jobs ?? [];

  return (
    <Page align="left">
      <PageHeader
        section="01"
        eyebrow="01 // JOB_POSTINGS"
        title="Job postings"
        description="Every posting your company has, with its applicant count and a funnel summary. Open one to work its pipeline."
      />

      {jobsQ.isLoading ? (
        <PageLoading />
      ) : jobsQ.isError ? (
        <PageError message="ERR // failed to load job postings" />
      ) : jobs.length === 0 ? (
        <PageEmptyState
          title="No job postings"
          description="This company has no job postings yet."
        />
      ) : (
        <Stack gap="4">
          {jobs.map((job) => (
            <Card key={job.id} data-testid="co-job-row">
              <CardBody>
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link
                        to={`/co/jobs/${job.id}`}
                        className="font-display text-body-lg font-medium text-[color:var(--color-text-strong)] hover:text-[color:var(--color-text-accent)]"
                      >
                        {job.title}
                      </Link>
                      <div className="data-mono mt-1 font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
                        {job.segment} {"//"} {job.location}
                        {job.is_remote ? " // REMOTE" : ""}
                      </div>
                    </div>
                    <Inline gap="3" align="center">
                      <Badge tone="good">
                        <span data-testid="co-job-applicant-count">
                          {job.applicant_count}{" "}
                          {job.applicant_count === 1 ? "APPLICANT" : "APPLICANTS"}
                        </span>
                      </Badge>
                      <Link
                        to={`/co/jobs/${job.id}`}
                        className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)] hover:text-[color:var(--color-accent-primaryHover)]"
                      >
                        Open pipeline →
                      </Link>
                    </Inline>
                  </div>
                  <FunnelSummary
                    stages={job.funnel.map((f) => ({
                      stageName: f.stage_name,
                      count: f.count,
                      color: f.color,
                    }))}
                  />
                </div>
              </CardBody>
            </Card>
          ))}
        </Stack>
      )}
    </Page>
  );
}
