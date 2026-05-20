import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Page,
  PageHeader,
  Card,
  CardBody,
  Button,
  Badge,
  Stack,
} from "@ae-hq/ui";

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
    <Page>
      <PageHeader section="01" eyebrow="01 // ATS_INTEGRATIONS" title="Connect your stack" />
      <Stack gap="3">
        {(q.data?.connections ?? []).map((c) => (
          <Card key={c.vendor}>
            <CardBody>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="font-display text-body-lg capitalize">{c.vendor}</div>
                  {c.last_synced_at ? (
                    <div className="data-mono mt-1 font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
                      LAST SYNC{" "}
                      {new Date(c.last_synced_at)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}
                    </div>
                  ) : (
                    <div className="data-mono mt-1 font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
                      NOT CONNECTED
                    </div>
                  )}
                </div>
                {c.is_connected ? (
                  <>
                    <Badge tone="good">CONNECTED</Badge>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => disconnectM.mutate(c.vendor as Vendor)}
                    >
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => connectM.mutate(c.vendor as Vendor)}>
                    Connect
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        ))}
      </Stack>
    </Page>
  );
}
