import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import {
  Page,
  PageHeader,
  PageSection,
  PageLoading,
  PageError,
  Card,
  CardBody,
  Button,
  Badge,
  CompanyLogo,
  Stack,
  Inline,
} from "@ae-hq/ui";

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
    return (
      <Page>
        <PageLoading />
      </Page>
    );
  }
  if (!q.data) {
    return (
      <Page>
        <PageError title="Candidate not found" />
      </Page>
    );
  }
  const c = q.data.candidate;

  return (
    <Page>
      <PageHeader
        section="01"
        eyebrow="01 // CANDIDATE_DETAIL"
        title={
          <Inline gap="6" align="start">
            <div className="data-mono flex h-20 w-20 items-center justify-center rounded-xl bg-[color:var(--color-accent-soft)] font-mono text-display-sm font-semibold text-[color:var(--color-text-accent)]">
              {c.initials}
            </div>
            <div className="flex-1">
              <span className="font-display text-display-xl font-semibold tracking-tight">
                {c.is_unlocked && c.name ? c.name : "Anonymous"}
              </span>
              <div className="mt-2 text-body-sm text-[color:var(--color-text-muted)]">
                {c.headline}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {c.segment_focus ? <Badge>{c.segment_focus}</Badge> : null}
                <Badge tone="info" data-testid="derived-sales-motion">
                  {c.sales_motion_label}
                </Badge>
                {c.is_unlocked ? <Badge tone="good">UNLOCKED</Badge> : null}
                {c.unlock_status === "pending" ? <Badge tone="warn">PENDING</Badge> : null}
              </div>
            </div>
          </Inline>
        }
        actions={
          !c.is_unlocked && c.unlock_status !== "pending" ? (
            <Button
              onClick={() => unlockM.mutate()}
              disabled={unlockM.isPending}
              data-testid="unlock-btn"
            >
              {unlockM.isPending ? "Charging..." : "Unlock"}
            </Button>
          ) : null
        }
      />

      {unlockM.isError ? (
        <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-state-warn)]">
          ERR {"//"} {(unlockM.error as Error).message}
        </div>
      ) : null}
      {unlockM.isSuccess ? (
        <Badge tone="good">
          {">"} CHARGED {unlockM.data?.mock_stripe_charge_id?.slice(0, 16)}…
        </Badge>
      ) : null}

      <PageSection section="02" title="Work history">
        <Stack gap="3">
          {(c.work_history as Array<Record<string, unknown>>).map((h) => {
            const co = h.companies as { name: string; logo_url: string | null } | null;
            return (
              <Card key={h.id as string}>
                <CardBody>
                  <div className="flex items-center gap-4">
                    <CompanyLogo name={co?.name ?? "Unknown"} logoUrl={co?.logo_url} size="md" />
                    <div className="flex-1">
                      <div className="font-medium">
                        {h.title as string} {"//"} {co?.name ?? "Unknown"}
                      </div>
                      <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
                        {h.start_date as string} →{" "}
                        {(h.end_date as string | null) ?? "PRESENT"}
                      </div>
                    </div>
                    {h.segment ? <Badge>{h.segment as string}</Badge> : null}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </Stack>
      </PageSection>
    </Page>
  );
}
