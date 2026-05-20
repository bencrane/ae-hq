import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ArticleSummary } from "@ae-hq/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useArticles } from "../lib/use-articles";
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
  ArticleCardCompact,
  FeedRow,
  type FeedRowData,
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
type JobsResponse = { jobs: JobRow[]; total: number; for_me: boolean };

function JobCard({ job }: { job: JobRow }) {
  return (
    <Link to={`/jobs/${job.id}`}>
      <Card interactive className="h-full">
        <CardHeader className="flex items-center gap-3">
          {job.company?.logo_url ? (
            <img
              src={job.company.logo_url}
              alt=""
              className="h-8 w-8 rounded border border-[color:var(--color-border-subtle)]"
            />
          ) : (
            <div className="h-8 w-8 rounded border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]" />
          )}
          <div className="flex-1">
            <div className="font-display text-body-lg leading-tight">{job.title}</div>
            <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
              {job.company?.name} {"//"} {job.location}
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <Inline gap="2" wrap>
            <Badge tone="good">
              ${Math.round(job.ote_min / 1000)}K–${Math.round(job.ote_max / 1000)}K OTE
            </Badge>
            <Badge>{job.segment}</Badge>
            <Badge>{job.stage}</Badge>
            {job.is_remote ? <Badge tone="muted">REMOTE</Badge> : null}
          </Inline>
        </CardBody>
      </Card>
    </Link>
  );
}

// Interleave compact article rows into the job list — a Carrying Quota card
// after every 4th job — for the Bloomberg-terminal feed texture.
function buildFeed(jobs: JobRow[], articles: ArticleSummary[]): FeedRowData[] {
  const rows: FeedRowData[] = [];
  let articleIdx = 0;
  jobs.forEach((job, i) => {
    rows.push({ type: "job", node: <JobCard job={job} /> });
    if ((i + 1) % 4 === 0 && articleIdx < articles.length) {
      const a = articles[articleIdx++]!;
      rows.push({
        type: "article-compact",
        kind: a.kind,
        title: a.title,
        authorName: a.author_name,
        readMinutes: a.read_minutes,
        as: ({ className, children }) => (
          <a href={`/insights/${a.slug}`} className={className}>
            {children}
          </a>
        ),
      });
    }
  });
  return rows;
}

export function Home() {
  const { session } = useAuth();
  const isAuthed = Boolean(session);
  // authed viewers default to the intent-filtered feed; anon viewers see all.
  const [showEverything, setShowEverything] = useState(false);
  const forMe = isAuthed && !showEverything;

  const jobsQ = useQuery({
    queryKey: ["jobs", "home", forMe],
    queryFn: async (): Promise<JobsResponse> => {
      const res = await api.api.v1.jobs.$get({
        query: forMe ? { for_me: "true" } : {},
      });
      if (!res.ok) throw new Error("failed to load jobs");
      return (await res.json()) as unknown as JobsResponse;
    },
  });
  const articlesQ = useArticles();

  const jobs = jobsQ.data?.jobs ?? [];
  const articles = articlesQ.data?.articles ?? [];
  // the BFF echoes whether it actually applied the intent filter
  const intentFilterActive = Boolean(jobsQ.data?.for_me);
  const feed = buildFeed(jobs, articles);

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
          isAuthed ? null : (
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
          )
        }
      />

      <PageSection
        section="02"
        title={intentFilterActive ? "Matched to your intent" : "Latest jobs"}
        actions={
          <Inline gap="3">
            <Badge tone={intentFilterActive ? "good" : "muted"}>
              {jobsQ.data?.total ?? 0} {intentFilterActive ? "MATCHES" : "TOTAL"}
            </Badge>
            {isAuthed ? (
              <Button
                variant="secondary"
                size="sm"
                data-testid="feed-toggle"
                onClick={() => setShowEverything((v) => !v)}
              >
                {showEverything ? "Filter to my intent" : "Show everything"}
              </Button>
            ) : null}
          </Inline>
        }
      >
        {intentFilterActive ? (
          <div
            data-testid="intent-filter-affordance"
            className="mb-5 rounded-xl border border-[color:var(--color-border-accent)] bg-[color:var(--color-accent-softer)] px-5 py-3"
          >
            <span className="data-mono font-mono text-mono-xs uppercase tracking-wider text-[color:var(--color-text-accent)]">
              {">"}_ Filtered to your declared intent — irrelevant roles are hidden.
            </span>
          </div>
        ) : null}
        {jobsQ.isLoading ? (
          <PageLoading />
        ) : jobsQ.isError ? (
          <PageError message="ERR // failed to load jobs" />
        ) : jobs.length === 0 ? (
          <PageEmptyState
            title="No matching jobs"
            description={
              intentFilterActive
                ? "Your intent signals are narrow. Try 'Show everything' to see the full market."
                : "No jobs are posted yet."
            }
          />
        ) : (
          <Grid cols={1} mdCols={2} gap="4">
            {feed.map((row, i) => (
              <FeedRow key={row.type === "job" ? `job-${i}` : `article-${i}`} row={row} />
            ))}
          </Grid>
        )}
      </PageSection>
    </Page>
  );
}
