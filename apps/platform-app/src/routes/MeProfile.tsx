import { type FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { SectionLabel } from "../components/ui/SectionLabel";

export function MeProfile() {
  const qc = useQueryClient();
  const candQ = useQuery({
    queryKey: ["candidate", "me"],
    queryFn: async () => {
      const res = await api.api.v1.candidates.me.$get();
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });
  const [headline, setHeadline] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  useEffect(() => {
    if (candQ.data?.candidate) {
      setHeadline(candQ.data.candidate.headline ?? "");
      setLinkedinUrl(candQ.data.candidate.linkedin_url ?? "");
    }
  }, [candQ.data]);

  const saveM = useMutation({
    mutationFn: async () => {
      const res = await api.api.v1.candidates.me.$patch({
        json: { headline, linkedin_url: linkedinUrl || undefined },
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidate", "me"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveM.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <SectionLabel index={1}>EDIT_PROFILE</SectionLabel>
      <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight">Profile</h1>
      <Card className="mt-8">
        <CardHeader>
          <div className="data-mono font-mono text-xs uppercase tracking-wider text-emerald-400">{">"} update</div>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="data-mono font-mono text-xs uppercase tracking-wider text-zinc-400">Headline</span>
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={140}
                className="rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="data-mono font-mono text-xs uppercase tracking-wider text-zinc-400">LinkedIn URL</span>
              <input
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                className="rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <Button type="submit" disabled={saveM.isPending} data-testid="save-profile">
              {saveM.isPending ? "Saving..." : "Save profile"}
            </Button>
            {saveM.isSuccess ? (
              <div className="data-mono font-mono text-xs uppercase tracking-wider text-emerald-400">SAVED</div>
            ) : null}
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
