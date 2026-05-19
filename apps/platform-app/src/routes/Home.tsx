import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { SectionLabel } from "../components/ui/SectionLabel";
import { DataBadge } from "../components/ui/DataBadge";
import { Button } from "../components/ui/Button";

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
    <div className="mx-auto max-w-7xl px-6 py-16">
      <section className="mb-20">
        <SectionLabel index={1}>MARKETPLACE</SectionLabel>
        <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
          The market for <span className="text-emerald-400">Account Executives</span> who already know how to sell.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-zinc-400">
          Verified attainment. Real deal sizes. Real tenure. No more games.
        </p>
        <div className="mt-8 flex gap-3">
          <Link to="/signup">
            <Button size="lg">Get started</Button>
          </Link>
          <Link to="/signin">
            <Button variant="secondary" size="lg">
              Sign in
            </Button>
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <SectionLabel index={2}>OPEN ROLES</SectionLabel>
            <h2 className="mt-2 text-3xl font-semibold">Latest jobs</h2>
          </div>
          <DataBadge tone="muted">
            {jobsQ.data?.total ?? 0} TOTAL
          </DataBadge>
        </div>

        {jobsQ.isLoading ? (
          <div className="data-mono font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
            Loading...
          </div>
        ) : jobsQ.isError ? (
          <div className="data-mono font-mono text-xs uppercase tracking-[0.2em] text-amber-400">
            ERR // failed to load jobs
          </div>
        ) : !jobsQ.data || jobsQ.data.jobs.length === 0 ? (
          <div className="data-mono font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
            No jobs yet.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {jobsQ.data.jobs.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`}>
                <Card className="h-full transition-colors hover:border-zinc-700">
                  <CardHeader className="flex items-center gap-3">
                    {j.company?.logo_url ? (
                      <img src={j.company.logo_url} alt="" className="h-8 w-8 rounded" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-zinc-800" />
                    )}
                    <div className="flex-1">
                      <div className="font-display text-lg leading-tight">{j.title}</div>
                      <div className="data-mono font-mono text-xs uppercase tracking-wider text-zinc-500">
                        {j.company?.name} {"//"} {j.location}
                      </div>
                    </div>
                  </CardHeader>
                  <CardBody className="flex flex-wrap gap-2">
                    <DataBadge tone="good">
                      ${Math.round(j.ote_min / 1000)}K–${Math.round(j.ote_max / 1000)}K OTE
                    </DataBadge>
                    <DataBadge>{j.segment}</DataBadge>
                    <DataBadge>{j.stage}</DataBadge>
                    {j.is_remote ? <DataBadge tone="muted">REMOTE</DataBadge> : null}
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
