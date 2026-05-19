import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { SectionLabel } from "../components/ui/SectionLabel";
import { DataBadge } from "../components/ui/DataBadge";

type Approval = {
  id: string;
  status: "pending" | "accepted" | "declined" | "expired";
  message: string | null;
  created_at: string;
  company: { id: string; slug: string; name: string; logo_url: string | null };
};
type ApprovalsShape = { approvals: Approval[] };

export function MeApprovals() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["approvals"],
    queryFn: async (): Promise<ApprovalsShape> => {
      const res = await api.api.v1.candidates.me.approvals.$get();
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as unknown as ApprovalsShape;
    },
  });
  const acceptM = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.v1.candidates.me.approvals[":id"].accept.$post({
        param: { id },
        json: {},
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });
  const declineM = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.v1.candidates.me.approvals[":id"].decline.$post({
        param: { id },
        json: {},
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <SectionLabel index={1}>APPROVALS</SectionLabel>
      <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight">Companies asking for you</h1>

      <div className="mt-8 grid gap-3">
        {(q.data?.approvals ?? []).map((a) => (
          <Card key={a.id} data-testid={`approval-${a.id}`}>
            <CardBody className="flex items-center gap-4">
              {a.company.logo_url ? (
                <img src={a.company.logo_url} alt="" className="h-12 w-12 rounded" />
              ) : (
                <div className="h-12 w-12 rounded bg-zinc-800" />
              )}
              <div className="flex-1">
                <div className="font-medium">{a.company.name}</div>
                <div className="data-mono mt-1 font-mono text-xs uppercase tracking-wider text-zinc-500">
                  {new Date(a.created_at).toISOString().slice(0, 10)}
                </div>
                {a.message ? <div className="mt-2 text-sm text-zinc-300">{a.message}</div> : null}
              </div>
              <div className="flex items-center gap-3">
                <DataBadge
                  tone={a.status === "accepted" ? "good" : a.status === "declined" ? "warn" : "default"}
                >
                  {a.status.toUpperCase()}
                </DataBadge>
                {a.status === "pending" ? (
                  <>
                    <Button
                      size="sm"
                      data-testid={`accept-${a.id}`}
                      disabled={acceptM.isPending}
                      onClick={() => acceptM.mutate(a.id)}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={declineM.isPending}
                      onClick={() => declineM.mutate(a.id)}
                    >
                      Decline
                    </Button>
                  </>
                ) : null}
              </div>
            </CardBody>
          </Card>
        ))}
        {q.data?.approvals?.length === 0 ? (
          <div className="data-mono font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
            No approval requests yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}
