import { type FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { SectionLabel } from "../components/ui/SectionLabel";
import { DataBadge } from "../components/ui/DataBadge";

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
          target_segments: segments as ("SMB" | "MidMarket" | "Enterprise" | "StrategicEnterprise")[],
          target_stages: stages as ("Seed" | "SeriesA" | "SeriesB" | "SeriesC" | "SeriesD" | "Public" | "Bootstrapped")[],
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
    <div className="mx-auto max-w-3xl px-6 py-12">
      <SectionLabel index={1}>INTENT_SIGNALS</SectionLabel>
      <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight">What you want</h1>
      <Card className="mt-8">
        <CardBody>
          <form onSubmit={onSubmit} className="flex flex-col gap-6">
            <div>
              <SectionLabel index={2}>SEGMENTS</SectionLabel>
              <div className="mt-3 flex flex-wrap gap-2">
                {SEGMENTS.map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => toggle(segments, setSegments, s)}
                    className={`data-mono rounded-none border px-3 py-1.5 font-mono text-xs uppercase tracking-wider ${
                      segments.includes(s)
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                        : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <SectionLabel index={3}>STAGES</SectionLabel>
              <div className="mt-3 flex flex-wrap gap-2">
                {STAGES.map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => toggle(stages, setStages, s)}
                    className={`data-mono rounded-none border px-3 py-1.5 font-mono text-xs uppercase tracking-wider ${
                      stages.includes(s)
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                        : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <SectionLabel index={4}>OTE_MIN (USD)</SectionLabel>
              <input
                type="number"
                value={otemin ?? ""}
                onChange={(e) => setOtemin(e.target.value ? Number(e.target.value) : null)}
                className="data-mono mt-2 w-48 rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <Button type="submit" data-testid="save-intent" disabled={saveM.isPending}>
              {saveM.isPending ? "Saving..." : "Save intent"}
            </Button>
            {saveM.isSuccess ? <DataBadge tone="good">SAVED</DataBadge> : null}
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
