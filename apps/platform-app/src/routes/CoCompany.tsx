import { type FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { SectionLabel } from "../components/ui/SectionLabel";

export function CoCompany() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["co", "company-edit"],
    queryFn: async () => {
      const res = await api.api.v1.company.me.$get();
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (q.data?.company) {
      setName(q.data.company.name ?? "");
      setDescription(q.data.company.description ?? "");
    }
  }, [q.data]);

  const m = useMutation({
    mutationFn: async () => {
      const res = await api.api.v1.company.me.$patch({ json: { name, description } });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["co", "company-edit"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    m.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <SectionLabel index={1}>COMPANY_PROFILE</SectionLabel>
      <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight">Edit company</h1>
      <Card className="mt-8">
        <CardBody>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="data-mono font-mono text-xs uppercase tracking-wider text-zinc-400">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="data-mono font-mono text-xs uppercase tracking-wider text-zinc-400">Description</span>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <Button type="submit" disabled={m.isPending}>{m.isPending ? "Saving..." : "Save"}</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
