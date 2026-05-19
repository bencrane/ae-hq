import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { SectionLabel } from "../components/ui/SectionLabel";
import { DataBadge } from "../components/ui/DataBadge";

type Tier = "starter" | "growth" | "scale";

const TIERS: { id: Tier; name: string; unlocks: number; price: string }[] = [
  { id: "starter", name: "Starter", unlocks: 10, price: "$2K / mo" },
  { id: "growth", name: "Growth", unlocks: 25, price: "$5K / mo" },
  { id: "scale", name: "Scale", unlocks: 60, price: "$12K / mo" },
];

export function CoBilling() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["co", "billing-detail"],
    queryFn: async () => {
      const res = await api.api.v1.company.billing.$get();
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });
  const m = useMutation({
    mutationFn: async (tier: Tier) => {
      const res = await api.api.v1.company.billing.checkout.$post({ json: { tier } });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["co", "billing-detail"] }),
  });

  const sub = q.data?.subscription;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <SectionLabel index={1}>BILLING</SectionLabel>
      <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight">Subscription</h1>

      {sub ? (
        <Card className="mt-8">
          <CardBody>
            <div className="flex items-center justify-between">
              <div>
                <div className="data-mono font-mono text-xs uppercase tracking-wider text-zinc-500">CURRENT TIER</div>
                <div className="data-mono mt-1 font-mono text-3xl font-semibold uppercase">
                  {sub.tier}
                </div>
              </div>
              <div className="text-right">
                <div className="data-mono font-mono text-xs uppercase tracking-wider text-zinc-500">UNLOCKS USED</div>
                <div className="data-mono mt-1 font-mono text-3xl font-semibold">
                  {sub.unlocks_used_current_period} / {sub.unlocks_per_month}
                </div>
              </div>
            </div>
            <DataBadge tone="good" className="mt-6">
              {">"} ACTIVE
            </DataBadge>
          </CardBody>
        </Card>
      ) : (
        <Card className="mt-8">
          <CardBody>
            <div className="text-zinc-400">No active subscription. Pick a tier below.</div>
          </CardBody>
        </Card>
      )}

      <section className="mt-12">
        <SectionLabel index={2}>PLANS</SectionLabel>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {TIERS.map((t) => (
            <Card key={t.id}>
              <CardHeader>
                <div className="font-display text-2xl">{t.name}</div>
                <div className="data-mono mt-1 font-mono text-xs uppercase tracking-wider text-emerald-400">
                  {t.price}
                </div>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="data-mono font-mono text-sm">
                  {t.unlocks} unlocks / month
                </div>
                <Button
                  size="md"
                  variant={sub?.tier === t.id ? "secondary" : "primary"}
                  onClick={() => m.mutate(t.id)}
                  disabled={m.isPending || sub?.tier === t.id}
                  data-testid={`tier-${t.id}`}
                >
                  {sub?.tier === t.id ? "Current" : "Choose"}
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
