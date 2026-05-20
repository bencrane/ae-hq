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
  CompanyProfileHeader,
} from "@ae-hq/ui";

// GET /api/v1/companies/:slug returns the full firmographic company row
// (cycle-4 columns: sales_motion, founded_year, investors[], employee_count)
// plus the company's open job postings.
type CompanyRecord = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  hq_location: string | null;
  stage: string | null;
  size_range: string | null;
  description: string | null;
  sales_motion: string | null;
  founded_year: number | null;
  employee_count: number | null;
  investors: string[] | null;
};
type JobRecord = {
  id: string;
  title: string;
  segment: string;
  location: string;
  ote_min: number;
  ote_max: number;
};

// Sales-motion token -> a human label for the firmographic facts row.
const SALES_MOTION_LABEL: Record<string, string> = {
  plg: "Product-led",
  sales_led: "Sales-led",
  enterprise: "Enterprise",
  hybrid: "Hybrid",
};

export function CompanyPublic() {
  const { slug = "" } = useParams();
  const q = useQuery({
    queryKey: ["company-public", slug],
    queryFn: async (): Promise<{ company: CompanyRecord; jobs: JobRecord[] } | null> => {
      const res = await api.api.v1.companies[":slug"].$get({ param: { slug } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as unknown as { company: CompanyRecord; jobs: JobRecord[] };
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
  const { company, jobs } = q.data;
  const investors = company.investors ?? [];

  // the compact firmographic facts row — only facts that have a value.
  const facts: { label: string; value: string }[] = [];
  if (company.hq_location) facts.push({ label: "HQ", value: company.hq_location });
  if (company.founded_year) facts.push({ label: "Founded", value: String(company.founded_year) });
  if (company.employee_count) {
    facts.push({ label: "Headcount", value: company.employee_count.toLocaleString() });
  } else if (company.size_range) {
    facts.push({ label: "Headcount", value: company.size_range });
  }
  if (company.stage) facts.push({ label: "Funding stage", value: company.stage });
  if (company.sales_motion) {
    facts.push({
      label: "Sales motion",
      value: SALES_MOTION_LABEL[company.sales_motion] ?? company.sales_motion,
    });
  }

  return (
    <Page align="center">
      <PageHeader section="01" eyebrow="01 // COMPANY" title="Company profile" />

      <CompanyProfileHeader
        name={company.name}
        logoUrl={company.logo_url}
        description={company.description}
        facts={facts}
      />

      <PageSection
        section="02"
        title="Investors"
        description="The venture firms backing this company."
      >
        {investors.length === 0 ? (
          <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
            No investor information available.
          </div>
        ) : (
          <Inline gap="2" wrap data-testid="company-investors">
            {investors.map((firm) => (
              <Badge key={firm} tone="info" data-testid="company-investor">
                {firm}
              </Badge>
            ))}
          </Inline>
        )}
      </PageSection>

      <PageSection section="03" title="Open roles">
        {jobs.length === 0 ? (
          <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
            No open roles right now.
          </div>
        ) : (
          <Grid cols={1} mdCols={2} gap="4">
            {jobs.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`} data-testid="company-open-role">
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
