import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { SectionLabel } from "../components/ui/SectionLabel";
import { DataBadge } from "../components/ui/DataBadge";

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
    company: { id: string; slug: string; name: string; logo_url: string | null; hq_location: string | null };
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
    return <div className="mx-auto max-w-4xl px-6 py-16 data-mono font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">Loading...</div>;
  }
  if (!q.data || !("job" in q.data)) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-3xl font-semibold">Job not found</h1>
        <Link to="/" className="data-mono mt-4 inline-block font-mono text-xs uppercase tracking-wider text-emerald-400">
          ← Back to jobs
        </Link>
      </div>
    );
  }
  const job = q.data.job;
  const company = job.company;

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <SectionLabel index={1}>OPEN ROLE</SectionLabel>
      <div className="mt-4 flex items-start gap-6">
        {company.logo_url ? (
          <img src={company.logo_url} alt="" className="h-16 w-16 rounded-xl border border-zinc-800" />
        ) : (
          <div className="h-16 w-16 rounded-xl bg-zinc-800" />
        )}
        <div>
          <h1 className="font-display text-4xl font-semibold leading-tight">{job.title}</h1>
          <Link to={`/companies/${company.slug}`} className="data-mono mt-2 inline-block font-mono text-xs uppercase tracking-wider text-emerald-400 hover:text-emerald-300">
            {company.name} {"//"} {company.hq_location}
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <SectionLabel index={2}>COMP</SectionLabel>
          </CardHeader>
          <CardBody>
            <div className="data-mono font-mono text-2xl font-semibold">
              ${Math.round((job.ote_min) / 1000)}K–${Math.round((job.ote_max) / 1000)}K
            </div>
            <div className="data-mono mt-1 font-mono text-xs uppercase tracking-wider text-zinc-500">OTE</div>
            <div className="data-mono mt-3 font-mono text-sm text-zinc-400">
              Base ${Math.round((job.base_min) / 1000)}K–${Math.round((job.base_max) / 1000)}K
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <SectionLabel index={3}>DEAL_SHAPE</SectionLabel>
          </CardHeader>
          <CardBody>
            <div className="data-mono font-mono text-2xl font-semibold">
              ${Math.round((job.deal_size_avg) / 1000)}K
            </div>
            <div className="data-mono mt-1 font-mono text-xs uppercase tracking-wider text-zinc-500">AVG DEAL</div>
            <div className="data-mono mt-3 font-mono text-sm text-zinc-400">
              {job.sales_cycle_days}d cycle
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <SectionLabel index={4}>FIT</SectionLabel>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-2">
              <DataBadge>{job.segment}</DataBadge>
              <DataBadge>{job.stage}</DataBadge>
              {job.methodology ? <DataBadge>{job.methodology}</DataBadge> : null}
              {job.is_remote ? <DataBadge tone="good">REMOTE</DataBadge> : null}
            </div>
            <div className="data-mono mt-3 font-mono text-xs uppercase tracking-wider text-zinc-500">
              Stack: {job.stack.join(", ")}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
