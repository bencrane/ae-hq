import { type FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Page,
  PageHeader,
  PageSection,
  Card,
  CardBody,
  Button,
  Field,
  Input,
  TagInput,
  Stack,
  Badge,
  Banner,
  PreferenceTagPicker,
  Toggle,
} from "@ae-hq/ui";

// The fixed option sets the AE picks from — tag-pickers, not free-form forms.
// Labels are the raw segment/stage codes (matching the cycle-1 picker the
// e2e suite targets — `button:has-text("MidMarket")`).
const SEGMENT_OPTIONS = [
  { value: "SMB", label: "SMB" },
  { value: "MidMarket", label: "MidMarket" },
  { value: "Enterprise", label: "Enterprise" },
  { value: "StrategicEnterprise", label: "StrategicEnterprise" },
] as const;

const STAGE_OPTIONS = [
  { value: "Seed", label: "Seed" },
  { value: "SeriesA", label: "SeriesA" },
  { value: "SeriesB", label: "SeriesB" },
  { value: "SeriesC", label: "SeriesC" },
  { value: "SeriesD", label: "SeriesD" },
  { value: "Public", label: "Public" },
] as const;

type Stage = (typeof STAGE_OPTIONS)[number]["value"] | "Bootstrapped";
type Segment = (typeof SEGMENT_OPTIONS)[number]["value"];

type CompanyOpt = { id: string; name: string };

export function MeIntent() {
  const qc = useQueryClient();
  const intentQ = useQuery({
    queryKey: ["intent"],
    queryFn: async () => {
      const res = await api.api.v1.candidates.me.intent.$get();
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });
  // The company list — used to resolve watched-company ids to names. Drawn
  // from the jobs feed (each job carries its company).
  const companiesQ = useQuery({
    queryKey: ["companies-for-intent"],
    queryFn: async () => {
      const res = await api.api.v1.jobs.$get({ query: { limit: "50" } });
      if (!res.ok) return { jobs: [] };
      return res.json();
    },
  });

  const [segments, setSegments] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [otemin, setOtemin] = useState<number | null>(null);
  const [investors, setInvestors] = useState<string[]>([]);
  const [watched, setWatched] = useState<string[]>([]);
  const [autoMatch, setAutoMatch] = useState(false);
  const [discoverable, setDiscoverable] = useState(true);

  useEffect(() => {
    const intent = intentQ.data?.intent as
      | {
          target_segments?: string[];
          target_stages?: string[];
          comp_ote_min?: number | null;
          target_investors?: string[];
          watched_companies?: string[];
          auto_match?: boolean;
          discoverable?: boolean;
        }
      | null
      | undefined;
    if (intent) {
      setSegments(intent.target_segments ?? []);
      setStages(intent.target_stages ?? []);
      setOtemin(intent.comp_ote_min ?? null);
      setInvestors(intent.target_investors ?? []);
      setWatched(intent.watched_companies ?? []);
      setAutoMatch(intent.auto_match ?? false);
      setDiscoverable(intent.discoverable ?? true);
    }
  }, [intentQ.data]);

  const companyOpts: CompanyOpt[] = Array.from(
    new Map(
      ((companiesQ.data?.jobs ?? []) as Array<{ company: { id: string; name: string } | null }>)
        .map((j) => j.company)
        .filter((c): c is { id: string; name: string } => Boolean(c))
        .map((c) => [c.id, c]),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));

  const saveM = useMutation({
    mutationFn: async () => {
      const res = await api.api.v1.candidates.me.intent.$put({
        json: {
          target_segments: segments as Segment[],
          target_stages: stages as Stage[],
          comp_ote_min: otemin ?? undefined,
          target_investors: investors,
          watched_companies: watched,
          auto_match: autoMatch,
          discoverable,
        },
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intent"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveM.mutate();
  }

  function toggleWatched(id: string) {
    setWatched((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  return (
    <Page variant="narrow">
      <PageHeader
        section="01"
        eyebrow="01 // INTENT_SIGNALS"
        title="What you're open to"
        description="Declare what you want. Companies that fit connect with you — you stay anonymous until you both say yes."
      />
      <Card>
        <CardBody>
          <form onSubmit={onSubmit}>
            <Stack gap="6">
              <PageSection section="02" title="Company segment">
                <PreferenceTagPicker
                  legend="Pick the segments you sell into"
                  options={SEGMENT_OPTIONS}
                  selected={segments}
                  onChange={setSegments}
                />
              </PageSection>

              <PageSection section="03" title="Company stage">
                <PreferenceTagPicker
                  legend="Pick the funding stages you're open to"
                  options={STAGE_OPTIONS}
                  selected={stages}
                  onChange={setStages}
                />
              </PageSection>

              <PageSection section="04" title="Investors">
                <Field
                  label="Open to companies backed by"
                  htmlFor="intent-investors"
                  description="Add VC firms — type a name and press Enter. You'll be matched with companies they back."
                >
                  <TagInput
                    id="intent-investors"
                    value={investors}
                    onChange={setInvestors}
                    placeholder="e.g. Sequoia Capital"
                  />
                </Field>
              </PageSection>

              <PageSection section="05" title="Watch specific companies">
                <p className="text-body-xs text-[color:var(--color-text-muted)]">
                  Get alerted when a company you're watching is hiring. Tap to add or remove.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {companyOpts.map((co) => {
                    const on = watched.includes(co.id);
                    return (
                      <button
                        key={co.id}
                        type="button"
                        aria-pressed={on}
                        data-testid={`watch-${co.id}`}
                        onClick={() => toggleWatched(co.id)}
                        className={`data-mono rounded-none border px-3 py-1.5 font-mono text-mono-xs uppercase transition-colors ${
                          on
                            ? "border-[color:var(--color-border-accent)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-text-accent)]"
                            : "border-[color:var(--color-border-subtle)] text-[color:var(--color-text-muted)] hover:border-[color:var(--color-border-default)]"
                        }`}
                      >
                        {co.name}
                      </button>
                    );
                  })}
                  {companyOpts.length === 0 ? (
                    <span className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
                      No companies to watch yet.
                    </span>
                  ) : null}
                </div>
              </PageSection>

              <PageSection section="06" title="Compensation">
                <Field label="OTE floor (USD)" htmlFor="intent-otemin">
                  <Input
                    id="intent-otemin"
                    type="number"
                    value={otemin ?? ""}
                    onChange={(e) => setOtemin(e.target.value ? Number(e.target.value) : null)}
                    className="w-48"
                  />
                </Field>
              </PageSection>

              <PageSection section="07" title="Matchmaking">
                <Stack gap="4">
                  <Toggle
                    id="intent-auto-match"
                    checked={autoMatch}
                    onChange={setAutoMatch}
                    label="Auto-open a conversation"
                    description="When a company that fits your criteria wants to talk, connect automatically — no approval step. When this is off, you get a one-tap accept/decline prompt instead."
                  />
                  <Toggle
                    id="intent-discoverable"
                    checked={discoverable}
                    onChange={setDiscoverable}
                    label="Let companies discover you"
                    description="Companies whose hiring fits your criteria can find your anonymized profile. Your name and details stay hidden until a match resolves."
                  />
                </Stack>
              </PageSection>

              <div className="flex items-center gap-3">
                <Button type="submit" data-testid="save-intent" disabled={saveM.isPending}>
                  {saveM.isPending ? "Saving…" : "Save intent"}
                </Button>
                {saveM.isSuccess ? <Badge tone="good">SAVED</Badge> : null}
              </div>
              {saveM.isError ? (
                <Banner tone="error">Could not save your intent. Try again.</Banner>
              ) : null}
            </Stack>
          </form>
        </CardBody>
      </Card>
    </Page>
  );
}
