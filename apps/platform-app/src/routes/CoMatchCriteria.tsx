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
} from "@ae-hq/ui";

// The fixed option sets a company picks from.
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

type CompanyOpt = { id: string; name: string };

export function CoMatchCriteria() {
  const qc = useQueryClient();
  const criteriaQ = useQuery({
    queryKey: ["company", "match-criteria"],
    queryFn: async () => {
      const res = await api.api.v1.company["match-criteria"].$get();
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });
  // company list for the "worked at" picker — drawn from the jobs feed.
  const companiesQ = useQuery({
    queryKey: ["companies-for-criteria"],
    queryFn: async () => {
      const res = await api.api.v1.jobs.$get({ query: { limit: "50" } });
      if (!res.ok) return { jobs: [] };
      return res.json();
    },
  });

  const [segments, setSegments] = useState<string[]>([]);
  const [motions, setMotions] = useState<string[]>([]);
  const [minYears, setMinYears] = useState<number>(0);
  const [workedAt, setWorkedAt] = useState<string[]>([]);
  const [pedigree, setPedigree] = useState<string[]>([]);

  useEffect(() => {
    const criteria = criteriaQ.data?.criteria as
      | {
          segments?: string[];
          sales_motions?: string[];
          min_years_experience?: number;
          worked_at_company_ids?: string[];
          investor_pedigree?: string[];
        }
      | null
      | undefined;
    if (criteria) {
      setSegments(criteria.segments ?? []);
      setMotions(criteria.sales_motions ?? []);
      setMinYears(criteria.min_years_experience ?? 0);
      setWorkedAt(criteria.worked_at_company_ids ?? []);
      setPedigree(criteria.investor_pedigree ?? []);
    }
  }, [criteriaQ.data]);

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
      const res = await api.api.v1.company["match-criteria"].$put({
        json: {
          segments: segments as Segment[],
          sales_motions: motions,
          min_years_experience: minYears,
          worked_at_company_ids: workedAt,
          investor_pedigree: pedigree,
        },
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company", "match-criteria"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveM.mutate();
  }

  function toggleWorkedAt(id: string) {
    setWorkedAt((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  return (
    <Page variant="narrow">
      <PageHeader
        section="01"
        eyebrow="01 // MATCH_CRITERIA"
        title="Your hiring criteria"
        description="Set who you're hiring. Candidates who meet these and express interest connect with you automatically — no per-candidate approval."
      />
      <Card>
        <CardBody>
          <form onSubmit={onSubmit}>
            <Stack gap="6">
              <PageSection section="02" title="Segment">
                <PreferenceTagPicker
                  legend="Sales segments you hire for"
                  options={SEGMENT_OPTIONS}
                  selected={segments}
                  onChange={setSegments}
                />
              </PageSection>

              <PageSection section="03" title="Sales motion">
                <PreferenceTagPicker
                  legend="Sales motions you're hiring for"
                  options={MOTION_OPTIONS}
                  selected={motions}
                  onChange={setMotions}
                />
              </PageSection>

              <PageSection section="04" title="Experience">
                <Field
                  label="Minimum years of experience"
                  htmlFor="criteria-min-years"
                  description="Candidates below this floor are not a standing match."
                >
                  <Input
                    id="criteria-min-years"
                    type="number"
                    min={0}
                    max={40}
                    value={minYears}
                    onChange={(e) => setMinYears(e.target.value ? Number(e.target.value) : 0)}
                    className="w-48"
                  />
                </Field>
              </PageSection>

              <PageSection section="05" title="Worked at">
                <p className="text-body-xs text-[color:var(--color-text-muted)]">
                  Require a candidate to have worked at one of these companies. Tap to add or
                  remove.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {companyOpts.map((co) => {
                    const on = workedAt.includes(co.id);
                    return (
                      <button
                        key={co.id}
                        type="button"
                        aria-pressed={on}
                        data-testid={`worked-at-${co.id}`}
                        onClick={() => toggleWorkedAt(co.id)}
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
                      No companies available.
                    </span>
                  ) : null}
                </div>
              </PageSection>

              <PageSection section="06" title="Investor pedigree">
                <Field
                  label="Backed by these investors"
                  htmlFor="criteria-pedigree"
                  description="Match candidates who worked at companies backed by these VC firms. Type a name and press Enter."
                >
                  <TagInput
                    id="criteria-pedigree"
                    value={pedigree}
                    onChange={setPedigree}
                    placeholder="e.g. Andreessen Horowitz"
                  />
                </Field>
              </PageSection>

              <div className="flex items-center gap-3">
                <Button type="submit" data-testid="save-criteria" disabled={saveM.isPending}>
                  {saveM.isPending ? "Saving…" : "Save criteria"}
                </Button>
                {saveM.isSuccess ? <Badge tone="good">SAVED</Badge> : null}
              </div>
              {saveM.isError ? (
                <Banner tone="error">Could not save your criteria. Try again.</Banner>
              ) : null}
            </Stack>
          </form>
        </CardBody>
      </Card>
    </Page>
  );
}
