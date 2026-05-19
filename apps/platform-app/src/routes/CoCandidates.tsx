import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { SectionLabel } from "../components/ui/SectionLabel";
import { DataBadge } from "../components/ui/DataBadge";

export function CoCandidates() {
  const companiesQ = useQuery({
    queryKey: ["companies-for-filter"],
    queryFn: async () => {
      // We need the company list for the "worked at" filter — use companies/:slug for stripe to seed
      // For now hardcode a fetch via /api/v1/jobs which embeds companies
      const res = await api.api.v1.jobs.$get({ query: { limit: "50" } });
      if (!res.ok) return { jobs: [] };
      return res.json();
    },
  });
  const [workedAt, setWorkedAt] = useState<string>("");
  const candQ = useQuery({
    queryKey: ["co", "candidates", workedAt],
    queryFn: async () => {
      const res = await api.api.v1.company.candidates.$get({
        query: workedAt ? { worked_at: workedAt, limit: "50" } : { limit: "50" },
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  // Build company option set from jobs payload
  type CompanyOpt = { id: string; name: string };
  const companyOpts: CompanyOpt[] = Array.from(
    new Map(
      ((companiesQ.data?.jobs ?? []) as Array<{ company: { id: string; name: string } | null }>)
        .map((j) => j.company)
        .filter((c): c is { id: string; name: string } => Boolean(c))
        .map((c) => [c.id, c]),
    ).values(),
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <SectionLabel index={1}>CANDIDATES</SectionLabel>
      <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight">Search</h1>

      <Card className="mt-8">
        <CardBody>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="data-mono font-mono text-xs uppercase tracking-wider text-zinc-400">Worked at</span>
              <select
                value={workedAt}
                onChange={(e) => setWorkedAt(e.target.value)}
                data-testid="filter-worked-at"
                className="data-mono rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="">ANY COMPANY</option>
                {companyOpts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <DataBadge tone="muted">{candQ.data?.total ?? 0} RESULTS</DataBadge>
          </div>
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-3">
        {(candQ.data?.candidates ?? []).map((c) => (
          <Link key={c.id} to={`/co/candidates/${c.id}`} data-testid={`candidate-${c.id}`}>
            <Card className="transition-colors hover:border-zinc-700">
              <CardBody className="flex items-center gap-4">
                <div className="data-mono flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 font-mono text-base font-semibold text-emerald-400">
                  {c.initials}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{c.headline ?? "AE"}</div>
                  <div className="data-mono mt-1 font-mono text-xs uppercase tracking-wider text-zinc-500">
                    {c.years_experience}yrs {"//"} {c.segment_focus ?? "—"} {"//"} {c.methodology.join(", ") || "—"}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.worked_at_companies.slice(0, 4).map((co) => (
                      <DataBadge key={co.id} tone="muted">
                        {co.name}
                      </DataBadge>
                    ))}
                  </div>
                </div>
                <Button size="sm" variant="secondary">
                  View →
                </Button>
              </CardBody>
            </Card>
          </Link>
        ))}
        {candQ.data?.candidates?.length === 0 ? (
          <div className="data-mono font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
            No candidates match those filters.
          </div>
        ) : null}
      </div>
    </div>
  );
}
