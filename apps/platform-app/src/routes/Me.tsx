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
  CompanyLogo,
  Grid,
  Stack,
  SectionLabel,
} from "@ae-hq/ui";

type MeShape = { profile: { name: string; email: string; kind: string } | null };
type HistShape = {
  work_history: Array<{
    id: string;
    title: string;
    segment: string | null;
    start_date: string;
    end_date: string | null;
    is_current: boolean;
    company: { name: string; logo_url: string | null };
  }>;
};

export function Me() {
  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<MeShape> => {
      const res = await api.api.v1.me.$get();
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as unknown as MeShape;
    },
  });
  const histQ = useQuery({
    queryKey: ["me", "history"],
    queryFn: async (): Promise<HistShape> => {
      const res = await api.api.v1.candidates.me["work-history"].$get();
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as unknown as HistShape;
    },
  });

  return (
    <Page>
      <PageHeader
        section="01"
        eyebrow="01 // CANDIDATE_DASHBOARD"
        title={meQ.data?.profile?.name ?? "Candidate"}
      />

      <Grid cols={1} mdCols={2} gap="6">
        <Card>
          <CardHeader>
            <SectionLabel index={2}>PROFILE</SectionLabel>
          </CardHeader>
          <CardBody>
            <div className="data-mono font-mono text-body-sm">{meQ.data?.profile?.email}</div>
            <Link
              to="/me/profile"
              className="data-mono mt-4 inline-block font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)] hover:text-[color:var(--color-accent-primaryHover)]"
            >
              Edit profile →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <SectionLabel index={3}>INTENT</SectionLabel>
          </CardHeader>
          <CardBody>
            <Link
              to="/me/intent"
              className="data-mono inline-block font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)] hover:text-[color:var(--color-accent-primaryHover)]"
            >
              Set intent →
            </Link>
          </CardBody>
        </Card>
      </Grid>

      <PageSection section="04" title="Track record">
        <Stack gap="3">
          {(histQ.data?.work_history ?? []).map((h) => (
            <Card key={h.id}>
              <CardBody>
                <div className="flex items-center gap-4">
                  <CompanyLogo name={h.company.name} logoUrl={h.company.logo_url} size="md" />
                  <div className="flex-1">
                    <div className="font-medium">
                      {h.title} {"//"} {h.company.name}
                    </div>
                    <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
                      {h.start_date} → {h.end_date ?? "PRESENT"}
                    </div>
                  </div>
                  {h.segment ? <Badge>{h.segment}</Badge> : null}
                  {h.is_current ? <Badge tone="good">CURRENT</Badge> : null}
                </div>
              </CardBody>
            </Card>
          ))}
          {histQ.data?.work_history?.length === 0 ? (
            <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
              No work history yet.{" "}
              <Link
                to="/me/profile"
                className="text-[color:var(--color-text-accent)] hover:text-[color:var(--color-accent-primaryHover)]"
              >
                Add entries →
              </Link>
            </div>
          ) : null}
        </Stack>
      </PageSection>
    </Page>
  );
}
