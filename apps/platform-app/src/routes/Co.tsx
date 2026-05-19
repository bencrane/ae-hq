import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { SectionLabel } from "../components/ui/SectionLabel";
import { DataBadge } from "../components/ui/DataBadge";

export function Co() {
  const coQ = useQuery({
    queryKey: ["co", "me"],
    queryFn: async () => {
      const res = await api.api.v1.company.me.$get();
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });
  const billingQ = useQuery({
    queryKey: ["co", "billing"],
    queryFn: async () => {
      const res = await api.api.v1.company.billing.$get();
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <SectionLabel index={1}>RECRUITER_DASHBOARD</SectionLabel>
      <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight">
        {coQ.data?.company?.name ?? "Your company"}
      </h1>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <SectionLabel index={2}>SUBSCRIPTION</SectionLabel>
          </CardHeader>
          <CardBody>
            <div className="data-mono font-mono text-2xl font-semibold">
              {billingQ.data?.subscription?.tier?.toUpperCase() ?? "—"}
            </div>
            <div className="data-mono mt-1 font-mono text-xs uppercase tracking-wider text-zinc-500">
              {billingQ.data?.subscription?.unlocks_used_current_period ?? 0} /{" "}
              {billingQ.data?.subscription?.unlocks_per_month ?? 0} UNLOCKS
            </div>
            <Link to="/co/billing" className="data-mono mt-4 inline-block font-mono text-xs uppercase tracking-wider text-emerald-400 hover:text-emerald-300">
              Manage →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <SectionLabel index={3}>SEARCH</SectionLabel>
          </CardHeader>
          <CardBody>
            <Link to="/co/candidates" className="data-mono inline-block font-mono text-xs uppercase tracking-wider text-emerald-400 hover:text-emerald-300">
              Browse candidates →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <SectionLabel index={4}>INTEGRATIONS</SectionLabel>
          </CardHeader>
          <CardBody>
            <Link to="/co/ats" className="data-mono inline-block font-mono text-xs uppercase tracking-wider text-emerald-400 hover:text-emerald-300">
              Connect ATS →
            </Link>
            <div className="mt-2">
              <Link to="/co/company" className="data-mono inline-block font-mono text-xs uppercase tracking-wider text-zinc-400 hover:text-emerald-400">
                Company details →
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-12">
        <DataBadge tone="good">{">"} ACTIVE SUBSCRIPTION</DataBadge>
      </div>
    </div>
  );
}
