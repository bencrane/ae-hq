import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Page,
  PageHeader,
  PageSection,
  Card,
  CardBody,
  Button,
  Badge,
  Stack,
  MatchStatusBadge,
} from "@ae-hq/ui";

type Company = { id: string; slug: string; name: string; logo_url: string | null };

type Approval = {
  id: string;
  status: "pending" | "accepted" | "declined" | "expired";
  message: string | null;
  created_at: string;
  company: Company;
};
type MatchApproval = {
  id: string;
  status: "pending_ae";
  origin: string;
  created_at: string;
  company: Company;
};
type ApprovalsShape = { approvals: Approval[]; match_approvals: MatchApproval[] };

function CompanyLogo({ company }: { company: Company }) {
  return company.logo_url ? (
    <img src={company.logo_url} alt="" className="h-12 w-12 rounded" />
  ) : (
    <div className="h-12 w-12 rounded bg-[color:var(--color-surface-raised)]" />
  );
}

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

  // ── legacy unlock-request approvals (the cycle-1 payment artifact) ────────
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

  // ── consent-engine match approvals (the surviving manual approval) ───────
  const matchAcceptM = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.v1.matches[":id"].accept.$post({ param: { id }, json: {} });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });
  const matchDeclineM = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.v1.matches[":id"].decline.$post({ param: { id }, json: {} });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });

  const matchApprovals = q.data?.match_approvals ?? [];
  const approvals = q.data?.approvals ?? [];
  const isEmpty = matchApprovals.length === 0 && approvals.length === 0;

  return (
    <Page>
      <PageHeader
        section="01"
        eyebrow="01 // APPROVALS"
        title="Companies asking for you"
        description="A company wants to talk. Accept and a conversation opens — decline and they never see your identity."
      />

      <Stack gap="6">
        {/* ── match approvals — the consent-engine prompts ─────────────── */}
        {matchApprovals.length > 0 ? (
          <PageSection section="02" title="Match requests">
            <Stack gap="3">
              {matchApprovals.map((m) => (
                <Card key={m.id} data-testid={`match-approval-${m.id}`}>
                  <CardBody>
                    <div className="flex items-center gap-4">
                      <CompanyLogo company={m.company} />
                      <div className="flex-1">
                        <div className="font-medium">{m.company.name}</div>
                        <div className="data-mono mt-1 font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
                          {new Date(m.created_at).toISOString().slice(0, 10)} {"//"} wants to connect
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <MatchStatusBadge status="pending_ae" />
                        <Button
                          size="sm"
                          data-testid={`match-accept-${m.id}`}
                          disabled={matchAcceptM.isPending}
                          onClick={() => matchAcceptM.mutate(m.id)}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={matchDeclineM.isPending}
                          onClick={() => matchDeclineM.mutate(m.id)}
                        >
                          Decline
                        </Button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </Stack>
          </PageSection>
        ) : null}

        {/* ── legacy unlock-request approvals ──────────────────────────── */}
        {approvals.length > 0 ? (
          <PageSection section="03" title="Profile unlock requests">
            <Stack gap="3">
              {approvals.map((a) => (
                <Card key={a.id} data-testid={`approval-${a.id}`}>
                  <CardBody>
                    <div className="flex items-center gap-4">
                      <CompanyLogo company={a.company} />
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
            </Stack>
          </PageSection>
        ) : null}

        {isEmpty ? (
          <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
            No requests yet.
          </div>
        ) : null}
      </Stack>
    </Page>
  );
}
