import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import {
  Page,
  PageHeader,
  PageSection,
  PageLoading,
  PageError,
  Card,
  CardBody,
  CardHeader,
  Badge,
  Grid,
  Inline,
} from "@ae-hq/ui";

export function CompanyPublic() {
  const { slug = "" } = useParams();
  const q = useQuery({
    queryKey: ["company-public", slug],
    queryFn: async () => {
      const res = await api.api.v1.companies[":slug"].$get({ param: { slug } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  if (q.isLoading) {
    return (
      <Page align="center">
        <PageLoading />
      </Page>
    );
  }
  if (!q.data) {
    return (
      <Page align="center">
        <PageError title="Company not found" />
      </Page>
    );
  }
  type CompanyRecord = {
    id: string;
    slug: string;
    name: string;
    logo_url: string | null;
    hq_location: string | null;
    stage: string | null;
    size_range: string | null;
    description: string | null;
  };
  type JobRecord = {
    id: string;
    title: string;
    segment: string;
    location: string;
    ote_min: number;
    ote_max: number;
  };
  const data = q.data as { company: CompanyRecord; jobs: JobRecord[] };

  return (
    <Page align="center">
      <PageHeader
        section="01"
        eyebrow="01 // COMPANY"
        title={
          <Inline gap="6" align="start">
            {data.company.logo_url ? (
              <img
                src={data.company.logo_url}
                alt=""
                className="h-20 w-20 rounded-xl border border-[color:var(--color-border-subtle)]"
              />
            ) : (
              <div className="h-20 w-20 rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]" />
            )}
            <div>
              <span className="font-display text-display-xl font-semibold tracking-tight">
                {data.company.name}
              </span>
              <div className="data-mono mt-2 font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
                {data.company.hq_location} {"//"} {data.company.stage} {"//"}{" "}
                {data.company.size_range}
              </div>
            </div>
          </Inline>
        }
        description={data.company.description ?? undefined}
      />

      <PageSection section="02" title="Open jobs">
        {data.jobs.length === 0 ? (
          <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
            No open roles right now.
          </div>
        ) : (
          <Grid cols={1} mdCols={2} gap="4">
            {data.jobs.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`}>
                <Card interactive className="h-full">
                  <CardHeader>
                    <div className="font-display text-body-lg">{j.title}</div>
                    <div className="data-mono mt-1 font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
                      {j.location}
                    </div>
                  </CardHeader>
                  <CardBody>
                    <Inline gap="2" wrap>
                      <Badge tone="good">
                        ${Math.round(j.ote_min / 1000)}K–${Math.round(j.ote_max / 1000)}K OTE
                      </Badge>
                      <Badge>{j.segment}</Badge>
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
