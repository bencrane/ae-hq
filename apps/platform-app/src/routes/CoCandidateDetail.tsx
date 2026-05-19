import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { SectionLabel } from "../components/ui/SectionLabel";
import { DataBadge } from "../components/ui/DataBadge";

export function CoCandidateDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["co", "candidate", id],
    queryFn: async () => {
      const res = await api.api.v1.company.candidates[":id"].$get({ param: { id } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });
  const unlockM = useMutation({
    mutationFn: async () => {
      const res = await api.api.v1.company.candidates[":id"].unlock.$post({
        param: { id },
        json: { message: "We'd love to talk." },
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: { message?: string } };
        throw new Error(j.error?.message ?? "unlock failed");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["co", "candidate", id] }),
  });

  if (q.isLoading) {
    return <div className="mx-auto max-w-4xl px-6 py-16 data-mono font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">Loading...</div>;
  }
  if (!q.data) {
    return <div className="mx-auto max-w-4xl px-6 py-16">Candidate not found</div>;
  }
  const c = q.data.candidate;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <SectionLabel index={1}>CANDIDATE_DETAIL</SectionLabel>
      <div className="mt-4 flex items-start gap-6">
        <div className="data-mono flex h-20 w-20 items-center justify-center rounded-xl bg-emerald-500/10 font-mono text-2xl font-semibold text-emerald-400">
          {c.initials}
        </div>
        <div className="flex-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {c.is_unlocked && c.name ? c.name : "Anonymous"}
          </h1>
          <div className="mt-2 text-sm text-zinc-400">{c.headline}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {c.segment_focus ? <DataBadge>{c.segment_focus}</DataBadge> : null}
            {c.methodology.map((m: string) => (
              <DataBadge key={m} tone="muted">
                {m}
              </DataBadge>
            ))}
            {c.is_unlocked ? <DataBadge tone="good">UNLOCKED</DataBadge> : null}
            {c.unlock_status === "pending" ? <DataBadge tone="warn">PENDING</DataBadge> : null}
          </div>
        </div>
        {!c.is_unlocked && c.unlock_status !== "pending" ? (
          <Button onClick={() => unlockM.mutate()} disabled={unlockM.isPending} data-testid="unlock-btn">
            {unlockM.isPending ? "Charging..." : "Unlock"}
          </Button>
        ) : null}
      </div>

      {unlockM.isError ? (
        <div className="data-mono mt-4 font-mono text-xs uppercase tracking-wider text-amber-400">
          ERR // {(unlockM.error as Error).message}
        </div>
      ) : null}
      {unlockM.isSuccess ? (
        <DataBadge tone="good" className="mt-4">
          {">"} CHARGED {unlockM.data?.mock_stripe_charge_id?.slice(0, 16)}…
        </DataBadge>
      ) : null}

      <section className="mt-12">
        <SectionLabel index={2}>WORK_HISTORY</SectionLabel>
        <div className="mt-4 grid gap-3">
          {(c.work_history as Array<Record<string, unknown>>).map((h) => {
            const co = h.companies as { name: string; logo_url: string | null } | null;
            return (
              <Card key={h.id as string}>
                <CardBody className="flex items-center gap-4">
                  {co?.logo_url ? <img src={co.logo_url} alt="" className="h-10 w-10 rounded" /> : <div className="h-10 w-10 rounded bg-zinc-800" />}
                  <div className="flex-1">
                    <div className="font-medium">{h.title as string} {"//"} {co?.name ?? "Unknown"}</div>
                    <div className="data-mono font-mono text-xs uppercase tracking-wider text-zinc-500">
                      {h.start_date as string} → {(h.end_date as string | null) ?? "PRESENT"}
                    </div>
                  </div>
                  {h.segment ? <DataBadge>{h.segment as string}</DataBadge> : null}
                </CardBody>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mt-12">
        <SectionLabel index={3}>CREDENTIALS</SectionLabel>
        <div className="mt-4 grid gap-3">
          {(c.credentials as Array<Record<string, unknown>>).map((cr, idx) => (
            <Card key={idx}>
              <CardBody>
                <div className="data-mono font-mono text-sm uppercase tracking-wider text-emerald-400">
                  {cr.kind as string}
                </div>
                <pre className="data-mono mt-2 font-mono text-xs text-zinc-300">{JSON.stringify(cr.value_json, null, 2)}</pre>
                <DataBadge tone="good" className="mt-3">{(cr.verification_tier as string).toUpperCase()}</DataBadge>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
