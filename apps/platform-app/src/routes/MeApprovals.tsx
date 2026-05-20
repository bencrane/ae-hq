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
    <Page>
      <PageHeader
        section="01"
        eyebrow="01 // APPROVALS"
        title="Companies asking for you"
      />
      <Stack gap="3">
        {(q.data?.approvals ?? []).map((a) => (
          <Card key={a.id} data-testid={`approval-${a.id}`}>
            <CardBody>
              <div className="flex items-center gap-4">
                {a.company.logo_url ? (
                  <img src={a.company.logo_url} alt="" className="h-12 w-12 rounded" />
                ) : (
                  <div className="h-12 w-12 rounded bg-[color:var(--color-surface-raised)]" />
                )}
                <div className="flex-1">
                  <div className="font-medium">{a.company.name}</div>
                  <div className="data-mono mt-1 font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
                    {new Date(a.created_at).toISOString().slice(0, 10)}
                  </div>
                  {a.message ? (
                    <div className="mt-2 text-body-sm text-[color:var(--color-text-default)]">
                      {a.message}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    tone={
                      a.status === "accepted"
                        ? "good"
                        : a.status === "declined"
                          ? "warn"
                          : "default"
                    }
                  >
                    {a.status.toUpperCase()}
                  </Badge>
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
              </div>
            </CardBody>
          </Card>
        ))}
        {q.data?.approvals?.length === 0 ? (
          <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
            No approval requests yet.
          </div>
        ) : null}
      </Stack>
    </Page>
  );
}
