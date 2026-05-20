import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { JobCollection } from "@ae-hq/shared";
import {
  Page,
  PageHeader,
  PageSection,
  PageLoading,
  PageError,
  PageEmptyState,
  Grid,
  Stack,
  Inline,
  Badge,
  Field,
  Input,
  Select,
  JobCard,
  CollectionSection,
} from "@ae-hq/ui";
import { api } from "../lib/api";

// One job row from GET /api/v1/jobs (the in-portal browse shares this endpoint
// with the public feed). `applied_job_ids` is derived from the candidate's own
// applications so the browse shows applied-state without a per-card request.
type JobRow = {
  id: string;
  title: string;
  segment: string;
  stage: string;
  location: string;
  is_remote: boolean;
  ote_min: number;
  ote_max: number;
  company: { id: string; slug: string; name: string; logo_url: string | null } | null;
};
type JobsResponse = { jobs: JobRow[]; total: number };
type CollectionsResponse = { collections: JobCollection[] };
type ApplicationsResponse = { applications: { job_id: string }[] };

const SEGMENTS = ["SMB", "MidMarket", "Enterprise", "StrategicEnterprise"] as const;

export function MeJobs() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("");

  // the full job set — the candidate's primary browse surface.
  const jobsQ = useQuery({
    queryKey: ["me-jobs", "browse"],
    queryFn: async (): Promise<JobsResponse> => {
      const res = await api.api.v1.jobs.$get({ query: {} });
      if (!res.ok) throw new Error("failed to load jobs");
      return (await res.json()) as unknown as JobsResponse;
    },
  });

  // curated collections, computed from company firmographics.
  const collectionsQ = useQuery({
    queryKey: ["me-jobs", "collections"],
    queryFn: async (): Promise<CollectionsResponse> => {
      const res = await api.api.v1.jobs.collections.$get();
      if (!res.ok) throw new Error("failed to load collections");
      return (await res.json()) as unknown as CollectionsResponse;
    },
  });

  // the candidate's own applications — drives applied-state on every card.
  const applicationsQ = useQuery({
    queryKey: ["me-jobs", "applications"],
    queryFn: async (): Promise<ApplicationsResponse> => {
      const res = await api.api.v1.candidates.me.applications.$get();
      if (!res.ok) throw new Error("failed to load applications");
      return (await res.json()) as unknown as ApplicationsResponse;
    },
  });

  const appliedIds = useMemo(
    () => new Set((applicationsQ.data?.applications ?? []).map((a) => a.job_id)),
    [applicationsQ.data],
  );

  const allJobs = jobsQ.data?.jobs ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allJobs.filter((j) => {
      if (segment && j.segment !== segment) return false;
      if (q && !j.title.toLowerCase().includes(q) && !(j.company?.name ?? "").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [allJobs, search, segment]);

  const collections = collectionsQ.data?.collections ?? [];

  return (
    <Page variant="wide" align="left">
      <PageHeader
        section="01"
        eyebrow="01 // BROWSE_JOBS"
        title="Browse jobs"
        description="Every open AE role on the platform. Apply without leaving your portal."
      />

      {/* curated collections — titled card groups grouped by a firmographic axis */}
      <PageSection
        section="02"
        title="Collections"
        description="Curated groups — jobs grouped by how the company sells, its funding stage, and who backs it."
      >
        {collectionsQ.isLoading ? (
          <PageLoading />
        ) : collectionsQ.isError ? (
          <PageError message="ERR // failed to load collections" />
        ) : collections.length === 0 ? (
          <PageEmptyState title="No collections" description="No curated collections are available." />
        ) : (
          <Stack gap="12">
            {collections.map((col) => (
              <CollectionSection key={col.id} title={col.title} subtitle={col.subtitle}>
                {col.jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    title={job.title}
                    companyName={job.company.name}
                    companyLogoUrl={job.company.logo_url}
                    location={job.location}
                    segment={job.segment}
                    stage={job.stage}
                    isRemote={job.is_remote}
                    oteMin={job.ote_min}
                    oteMax={job.ote_max}
                    applied={job.applied || appliedIds.has(job.id)}
                    width="fixed"
                    onClick={() => navigate(`/jobs/${job.id}`)}
                  />
                ))}
              </CollectionSection>
            ))}
          </Stack>
        )}
      </PageSection>

      {/* full searchable browse */}
      <PageSection
        section="03"
        title="All roles"
        actions={
          <Badge tone="muted">
            {filtered.length} {filtered.length === 1 ? "ROLE" : "ROLES"}
          </Badge>
        }
      >
        <Stack gap="6">
          <Inline gap="4" wrap>
            <Field label="Search" htmlFor="me-jobs-search">
              <Input
                id="me-jobs-search"
                placeholder="Title or company"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
            <Field label="Segment" htmlFor="me-jobs-segment">
              <Select
                id="me-jobs-segment"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                options={[
                  { value: "", label: "All segments" },
                  ...SEGMENTS.map((s) => ({ value: s, label: s })),
                ]}
              />
            </Field>
          </Inline>

          {jobsQ.isLoading ? (
            <PageLoading />
          ) : jobsQ.isError ? (
            <PageError message="ERR // failed to load jobs" />
          ) : filtered.length === 0 ? (
            <PageEmptyState
              title="No matching roles"
              description="No roles match your search. Try a broader query."
            />
          ) : (
            <Grid cols={1} mdCols={2} lgCols={3} gap="4">
              {filtered.map((job) => (
                <JobCard
                  key={job.id}
                  title={job.title}
                  companyName={job.company?.name ?? "—"}
                  companyLogoUrl={job.company?.logo_url}
                  location={job.location}
                  segment={job.segment}
                  stage={job.stage}
                  isRemote={job.is_remote}
                  oteMin={job.ote_min}
                  oteMax={job.ote_max}
                  applied={appliedIds.has(job.id)}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                />
              ))}
            </Grid>
          )}
        </Stack>
      </PageSection>
    </Page>
  );
}
