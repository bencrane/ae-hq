import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { SectionLabel } from "../components/ui/SectionLabel";
import { DataBadge } from "../components/ui/DataBadge";

type Vendor = "greenhouse" | "lever" | "ashby" | "rippling" | "bamboohr";

export function CoAts() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["co", "ats"],
    queryFn: async () => {
      const res = await api.api.v1.company.ats.$get();
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const connectM = useMutation({
    mutationFn: async (vendor: Vendor) => {
      const res = await api.api.v1.company.ats[":vendor"].connect.$post({
        param: { vendor },
        json: { api_key: "mock_api_key" },
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["co", "ats"] }),
  });
  const disconnectM = useMutation({
    mutationFn: async (vendor: Vendor) => {
      const res = await api.api.v1.company.ats[":vendor"].disconnect.$post({ param: { vendor } });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["co", "ats"] }),
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <SectionLabel index={1}>ATS_INTEGRATIONS</SectionLabel>
      <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight">Connect your stack</h1>
      <div className="mt-8 grid gap-3">
        {(q.data?.connections ?? []).map((c) => (
          <Card key={c.vendor}>
            <CardBody className="flex items-center gap-4">
              <div className="flex-1">
                <div className="font-display text-lg capitalize">{c.vendor}</div>
                {c.last_synced_at ? (
                  <div className="data-mono mt-1 font-mono text-xs uppercase tracking-wider text-zinc-500">
                    LAST SYNC {new Date(c.last_synced_at).toISOString().slice(0, 16).replace("T", " ")}
                  </div>
                ) : (
                  <div className="data-mono mt-1 font-mono text-xs uppercase tracking-wider text-zinc-500">
                    NOT CONNECTED
                  </div>
                )}
              </div>
              {c.is_connected ? (
                <>
                  <DataBadge tone="good">CONNECTED</DataBadge>
                  <Button variant="secondary" size="sm" onClick={() => disconnectM.mutate(c.vendor as Vendor)}>
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => connectM.mutate(c.vendor as Vendor)}>
                  Connect
                </Button>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
