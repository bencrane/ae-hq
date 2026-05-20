import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Page,
  PageHeader,
  PageSection,
  Card,
  CardBody,
  Button,
  Badge,
  Field,
  Input,
  TagInput,
  Stack,
  Inline,
  PreferenceTagPicker,
  AnonymousCandidateCard,
  MatchStatusBadge,
  type MatchStatus,
} from "@ae-hq/ui";

const SEGMENT_OPTIONS = [
  { value: "SMB", label: "SMB" },
  { value: "MidMarket", label: "Mid-Market" },
  { value: "Enterprise", label: "Enterprise" },
  { value: "StrategicEnterprise", label: "Strategic Enterprise" },
] as const;

const MOTION_OPTIONS = [
  { value: "plg", label: "Product-led" },
  { value: "sales_led", label: "Sales-led" },
  { value: "enterprise", label: "Enterprise" },
  { value: "hybrid", label: "Hybrid" },
] as const;

type Segment = (typeof SEGMENT_OPTIONS)[number]["value"];

type DiscoverCard = {
  candidate_id: string;
  initials: string;
  headline: string | null;
  segment_focus: string | null;
  years_experience: number;
  sales_motion_label: string;
  worked_at_companies: Array<{ id: string; name: string; logo_url: string | null }>;
};
type DiscoverResponse = { candidates: DiscoverCard[]; total: number };

export function CoDiscover() {
  // ── the criteria-builder state ──────────────────────────────────────────
  const [segments, setSegments] = useState<string[]>([]);
  const [motions, setMotions] = useState<string[]>([]);
  const [minYears, setMinYears] = useState<number | null>(null);
  const [pedigree, setPedigree] = useState<string[]>([]);
  // the query that was actually run — only changes on "Search", so editing the
  // builder does not re-fire the query keystroke-by-keystroke.
  const [ranQuery, setRanQuery] = useState<{
    segments: Segment[];
    sales_motions: string[];
    min_years_experience?: number;
    investor_pedigree: string[];
  } | null>(null);

  // per-candidate match outcome after expressing interest.
  const [outcomes, setOutcomes] = useState<Record<string, MatchStatus>>({});

  const discoverQ = useQuery({
    queryKey: ["co", "discover", ranQuery],
    enabled: ranQuery !== null,
    queryFn: async (): Promise<DiscoverResponse> => {
      const res = await api.api.v1.company.discover.$post({
        json: ranQuery ?? {},
      });
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as unknown as DiscoverResponse;
    },
  });

  const interestM = useMutation({
    mutationFn: async (candidateId: string) => {
      const res = await api.api.v1.company.candidates[":id"]["express-interest"].$post({
        param: { id: candidateId },
        json: {},
      });
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as unknown as {
        match: { status: MatchStatus };
        resolved: boolean;
      };
    },
    onSuccess: (data, candidateId) => {
      setOutcomes((cur) => ({ ...cur, [candidateId]: data.match.status }));
    },
  });

  function runSearch() {
    setRanQuery({
      segments: segments as Segment[],
      sales_motions: motions,
      min_years_experience: minYears ?? undefined,
      investor_pedigree: pedigree,
    });
    setOutcomes({});
  }

  const cards = discoverQ.data?.candidates ?? [];

  return (
    <Page variant="wide">
      <PageHeader
        section="01"
        eyebrow="01 // DISCOVER"
        title="Find account executives"
        description="Build a criteria query. Candidates whose own intent fits your company appear here — anonymized until you both connect."
      />

      <Card>
        <CardBody>
          <Stack gap="5">
            <PageSection section="02" title="Segment">
              <PreferenceTagPicker
                legend="Filter by sales segment"
                options={SEGMENT_OPTIONS}
                selected={segments}
                onChange={setSegments}
              />
            </PageSection>
            <PageSection section="03" title="Sales motion">
              <PreferenceTagPicker
                legend="Filter by sales motion"
                options={MOTION_OPTIONS}
                selected={motions}
                onChange={setMotions}
              />
            </PageSection>
            <Inline gap="6" wrap align="end">
              <Field label="Minimum years" htmlFor="discover-min-years">
                <Input
                  id="discover-min-years"
                  type="number"
                  min={0}
                  max={40}
                  value={minYears ?? ""}
                  onChange={(e) => setMinYears(e.target.value ? Number(e.target.value) : null)}
                  className="w-40"
                />
              </Field>
              <Field
                label="Investor pedigree"
                htmlFor="discover-pedigree"
                description="Worked at a company backed by these VCs."
              >
                <TagInput
                  id="discover-pedigree"
                  value={pedigree}
                  onChange={setPedigree}
                  placeholder="e.g. Sequoia Capital"
                />
              </Field>
            </Inline>
            <div>
              <Button type="button" data-testid="run-discover" onClick={runSearch}>
                Search candidates
              </Button>
            </div>
          </Stack>
        </CardBody>
      </Card>

      <Stack gap="3" unsafe_className="mt-6">
        {ranQuery !== null ? (
          <Inline gap="3" align="center">
            <Badge tone="muted">{discoverQ.data?.total ?? 0} RESULTS</Badge>
            {discoverQ.isLoading ? (
              <span className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
                Searching…
              </span>
            ) : null}
          </Inline>
        ) : null}

        {cards.map((c) => {
          const outcome = outcomes[c.candidate_id];
          return (
            <div key={c.candidate_id} data-testid={`discover-card-${c.candidate_id}`}>
              <AnonymousCandidateCard
                initials={c.initials}
                headline={c.headline}
                yearsExperience={c.years_experience}
                segmentFocus={c.segment_focus}
                salesMotionLabel={c.sales_motion_label}
                workedAtCompanies={c.worked_at_companies}
                action={
                  outcome ? (
                    <MatchStatusBadge status={outcome} />
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      data-testid={`express-interest-${c.candidate_id}`}
                      disabled={interestM.isPending}
                      onClick={() => interestM.mutate(c.candidate_id)}
                    >
                      Express interest
                    </Button>
                  )
                }
              />
            </div>
          );
        })}

        {ranQuery !== null && !discoverQ.isLoading && cards.length === 0 ? (
          <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
            No discoverable candidates match those criteria.
          </div>
        ) : null}
        {ranQuery === null ? (
          <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
            Build a criteria query above and search.
          </div>
        ) : null}
      </Stack>
    </Page>
  );
}
