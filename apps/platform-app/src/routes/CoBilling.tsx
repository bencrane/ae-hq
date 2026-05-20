import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Page,
  PageHeader,
  PageSection,
  Card,
  CardBody,
  CardHeader,
  Button,
  Badge,
  Grid,
  Stat,
} from "@ae-hq/ui";

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
    <Page>
      <PageHeader section="01" eyebrow="01 // BILLING" title="Subscription" />

      {sub ? (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <Stat label="CURRENT TIER" value={(sub.tier as string).toUpperCase()} />
              <Stat
                label="UNLOCKS USED"
                value={`${sub.unlocks_used_current_period} / ${sub.unlocks_per_month}`}
              />
            </div>
            <div className="mt-6">
              <Badge tone="good">{">"} ACTIVE</Badge>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <div className="text-[color:var(--color-text-muted)]">
              No active subscription. Pick a tier below.
            </div>
          </CardBody>
        </Card>
      )}

      <PageSection section="02" title="Plans">
        <Grid cols={1} mdCols={3} gap="4">
          {TIERS.map((t) => (
            <Card key={t.id}>
              <CardHeader>
                <div className="font-display text-display-sm">{t.name}</div>
                <div className="data-mono mt-1 font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)]">
                  {t.price}
                </div>
              </CardHeader>
              <CardBody>
                <div className="data-mono font-mono text-body-sm">{t.unlocks} unlocks / month</div>
                <div className="mt-4">
                  <Button
                    size="md"
                    variant={sub?.tier === t.id ? "secondary" : "primary"}
                    onClick={() => m.mutate(t.id)}
                    disabled={m.isPending || sub?.tier === t.id}
                    data-testid={`tier-${t.id}`}
                  >
                    {sub?.tier === t.id ? "Current" : "Choose"}
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </Grid>
      </PageSection>
    </Page>
  );
}
