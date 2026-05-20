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
  Stack,
  Inline,
  Badge,
} from "@ae-hq/ui";

const SEGMENTS = ["SMB", "MidMarket", "Enterprise", "StrategicEnterprise"] as const;
const STAGES = ["Seed", "SeriesA", "SeriesB", "SeriesC", "SeriesD", "Public"] as const;

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
  const [segments, setSegments] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [otemin, setOtemin] = useState<number | null>(null);

  useEffect(() => {
    if (intentQ.data?.intent) {
      setSegments(intentQ.data.intent.target_segments ?? []);
      setStages(intentQ.data.intent.target_stages ?? []);
      setOtemin(intentQ.data.intent.comp_ote_min ?? null);
    }
  }, [intentQ.data]);

  const saveM = useMutation({
    mutationFn: async () => {
      const res = await api.api.v1.candidates.me.intent.$put({
        json: {
          target_segments: segments as (typeof SEGMENTS)[number][],
          target_stages: stages as (
            | "Seed"
            | "SeriesA"
            | "SeriesB"
            | "SeriesC"
            | "SeriesD"
            | "Public"
            | "Bootstrapped"
          )[],
          comp_ote_min: otemin ?? undefined,
        },
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intent"] }),
  });

  function toggle(arr: string[], set: (v: string[]) => void, v: string) {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveM.mutate();
  }

  return (
    <Page variant="narrow">
      <PageHeader section="01" eyebrow="01 // INTENT_SIGNALS" title="What you want" />
      <Card>
        <CardBody>
          <form onSubmit={onSubmit}>
            <Stack gap="6">
              <PageSection section="02" title="Segments">
                <Inline gap="2" wrap>
                  {SEGMENTS.map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => toggle(segments, setSegments, s)}
                      className={`data-mono rounded-none border px-3 py-1.5 font-mono text-mono-xs uppercase ${
                        segments.includes(s)
                          ? "border-[color:var(--color-border-accent)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-text-accent)]"
                          : "border-[color:var(--color-border-subtle)] text-[color:var(--color-text-muted)] hover:border-[color:var(--color-border-default)]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </Inline>
              </PageSection>
              <PageSection section="03" title="Stages">
                <Inline gap="2" wrap>
                  {STAGES.map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => toggle(stages, setStages, s)}
                      className={`data-mono rounded-none border px-3 py-1.5 font-mono text-mono-xs uppercase ${
                        stages.includes(s)
                          ? "border-[color:var(--color-border-accent)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-text-accent)]"
                          : "border-[color:var(--color-border-subtle)] text-[color:var(--color-text-muted)] hover:border-[color:var(--color-border-default)]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </Inline>
              </PageSection>
              <Field label="OTE_MIN (USD)" htmlFor="intent-otemin">
                <Input
                  id="intent-otemin"
                  type="number"
                  value={otemin ?? ""}
                  onChange={(e) => setOtemin(e.target.value ? Number(e.target.value) : null)}
                  className="w-48"
                />
              </Field>
              <Button type="submit" data-testid="save-intent" disabled={saveM.isPending}>
                {saveM.isPending ? "Saving..." : "Save intent"}
              </Button>
              {saveM.isSuccess ? <Badge tone="good">SAVED</Badge> : null}
            </Stack>
          </form>
        </CardBody>
      </Card>
    </Page>
  );
}
