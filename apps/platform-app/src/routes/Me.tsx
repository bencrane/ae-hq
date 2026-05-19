import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { SectionLabel } from "../components/ui/SectionLabel";
import { DataBadge } from "../components/ui/DataBadge";

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
type CredShape = { credentials: Array<{ id: string }> };

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
  const credQ = useQuery({
    queryKey: ["me", "credentials"],
    queryFn: async (): Promise<CredShape> => {
      const res = await api.api.v1.credentials.$get();
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as unknown as CredShape;
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <SectionLabel index={1}>CANDIDATE_DASHBOARD</SectionLabel>
      <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight">
        {meQ.data?.profile?.name ?? "Candidate"}
      </h1>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <SectionLabel index={2}>PROFILE</SectionLabel>
          </CardHeader>
          <CardBody>
            <div className="data-mono font-mono text-sm">{meQ.data?.profile?.email}</div>
            <Link to="/me/profile" className="data-mono mt-4 inline-block font-mono text-xs uppercase tracking-wider text-emerald-400 hover:text-emerald-300">
              Edit profile →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <SectionLabel index={3}>INTENT</SectionLabel>
          </CardHeader>
          <CardBody>
            <Link to="/me/intent" className="data-mono inline-block font-mono text-xs uppercase tracking-wider text-emerald-400 hover:text-emerald-300">
              Set intent →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <SectionLabel index={4}>CREDENTIALS</SectionLabel>
          </CardHeader>
          <CardBody>
            <div className="data-mono font-mono text-2xl font-semibold">
              {credQ.data?.credentials?.length ?? 0}
            </div>
            <div className="data-mono mt-1 font-mono text-xs uppercase tracking-wider text-zinc-500">VERIFIED</div>
            <Link to="/me/credentials" className="data-mono mt-4 inline-block font-mono text-xs uppercase tracking-wider text-emerald-400 hover:text-emerald-300">
              Manage →
            </Link>
          </CardBody>
        </Card>
      </div>

      <section className="mt-12">
        <SectionLabel index={5}>WORK_HISTORY</SectionLabel>
        <h2 className="font-display mt-2 text-2xl font-semibold tracking-tight">Track record</h2>
        <div className="mt-4 grid gap-3">
          {(histQ.data?.work_history ?? []).map((h) => (
            <Card key={h.id}>
              <CardBody className="flex items-center gap-4">
                {h.company.logo_url ? (
                  <img src={h.company.logo_url} alt="" className="h-10 w-10 rounded" />
                ) : (
                  <div className="h-10 w-10 rounded bg-zinc-800" />
                )}
                <div className="flex-1">
                  <div className="font-medium">
                    {h.title} {"//"} {h.company.name}
                  </div>
                  <div className="data-mono font-mono text-xs uppercase tracking-wider text-zinc-500">
                    {h.start_date} → {h.end_date ?? "PRESENT"}
                  </div>
                </div>
                {h.segment ? <DataBadge>{h.segment}</DataBadge> : null}
                {h.is_current ? <DataBadge tone="good">CURRENT</DataBadge> : null}
              </CardBody>
            </Card>
          ))}
          {histQ.data?.work_history?.length === 0 ? (
            <div className="data-mono font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
              No work history yet. <Link to="/me/profile" className="text-emerald-400 hover:text-emerald-300">Add entries →</Link>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
