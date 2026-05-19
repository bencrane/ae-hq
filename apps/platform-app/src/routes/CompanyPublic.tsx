import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { SectionLabel } from "../components/ui/SectionLabel";
import { DataBadge } from "../components/ui/DataBadge";

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
    return <div className="mx-auto max-w-5xl px-6 py-16 data-mono font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">Loading...</div>;
  }
  if (!q.data) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-3xl font-semibold">Company not found</h1>
      </div>
    );
  }
  const { company, jobs } = q.data;

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="flex items-start gap-6">
        {company.logo_url ? (
          <img src={company.logo_url} alt="" className="h-20 w-20 rounded-xl border border-zinc-800" />
        ) : (
          <div className="h-20 w-20 rounded-xl bg-zinc-800" />
        )}
        <div>
          <SectionLabel index={1}>COMPANY</SectionLabel>
          <h1 className="font-display mt-2 text-5xl font-semibold tracking-tight">{company.name}</h1>
          <div className="data-mono mt-2 font-mono text-xs uppercase tracking-wider text-zinc-500">
            {company.hq_location} {"//"} {company.stage} {"//"} {company.size_range}
          </div>
        </div>
      </div>
      {company.description ? (
        <p className="mt-8 max-w-3xl text-lg text-zinc-400">{company.description}</p>
      ) : null}
      <div className="mt-12">
        <SectionLabel index={2}>OPEN JOBS</SectionLabel>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(jobs as Array<Record<string, unknown>>).map((j) => (
            <Link key={j.id as string} to={`/jobs/${j.id}`}>
              <Card className="h-full transition-colors hover:border-zinc-700">
                <CardHeader>
                  <div className="font-display text-lg">{j.title as string}</div>
                  <div className="data-mono mt-1 font-mono text-xs uppercase tracking-wider text-zinc-500">
                    {j.location as string}
                  </div>
                </CardHeader>
                <CardBody className="flex flex-wrap gap-2">
                  <DataBadge tone="good">
                    ${Math.round((j.ote_min as number) / 1000)}K–${Math.round((j.ote_max as number) / 1000)}K OTE
                  </DataBadge>
                  <DataBadge>{j.segment as string}</DataBadge>
                </CardBody>
              </Card>
            </Link>
          ))}
          {(jobs as unknown[]).length === 0 ? (
            <div className="data-mono font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
              No open roles right now.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
