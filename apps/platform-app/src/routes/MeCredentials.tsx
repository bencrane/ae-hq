import { type ChangeEvent, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { SectionLabel } from "../components/ui/SectionLabel";
import { DataBadge } from "../components/ui/DataBadge";

export function MeCredentials() {
  const qc = useQueryClient();
  const credQ = useQuery({
    queryKey: ["credentials"],
    queryFn: async () => {
      const res = await api.api.v1.credentials.$get();
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lastPreview, setLastPreview] = useState<Record<string, unknown> | null>(null);

  const uploadM = useMutation({
    mutationFn: async (file: File) => {
      setUploading(true);
      try {
        const signRes = await api.api.v1.credentials.uploads.sign.$post({
          json: { filename: file.name, content_type: file.type || "text/csv", byte_size: file.size },
        });
        if (!signRes.ok) throw new Error("sign failed");
        const sign = await signRes.json();
        const parseRes = await api.api.v1.credentials.uploads[":id"].parse.$post({
          param: { id: sign.upload_id },
          json: { kind: "quota_attainment" },
        });
        if (!parseRes.ok) throw new Error("parse failed");
        return parseRes.json();
      } finally {
        setUploading(false);
      }
    },
    onSuccess: (data) => {
      setLastPreview(data.preview as Record<string, unknown>);
      qc.invalidateQueries({ queryKey: ["credentials"] });
    },
  });

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) uploadM.mutate(f);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <SectionLabel index={1}>CREDENTIALS</SectionLabel>
      <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight">Verified record</h1>

      <Card className="mt-8">
        <CardHeader>
          <SectionLabel index={2}>UPLOAD_CSV</SectionLabel>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-zinc-400">
            Upload a CSV from your CRM or quota dashboard. We'll parse it and add a credential.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
            className="hidden"
            data-testid="credentials-csv"
          />
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            data-testid="upload-csv-btn"
          >
            {uploading ? "Uploading..." : "Upload CSV"}
          </Button>
          {lastPreview ? (
            <div className="data-mono mt-4 rounded-none border border-emerald-700/50 bg-emerald-900/20 p-4 font-mono text-xs">
              <div className="mb-2 text-emerald-400">PARSED</div>
              <pre className="whitespace-pre-wrap text-emerald-200">{JSON.stringify(lastPreview, null, 2)}</pre>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <section className="mt-10">
        <SectionLabel index={3}>VERIFIED_CREDENTIALS</SectionLabel>
        <h2 className="font-display mt-2 text-2xl font-semibold tracking-tight">Your record</h2>
        <div className="mt-4 grid gap-3">
          {(credQ.data?.credentials ?? []).map((c) => (
            <Card key={c.id as string}>
              <CardBody className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="data-mono font-mono text-sm uppercase tracking-wider text-emerald-400">
                    {c.kind as string}
                  </div>
                  <div className="data-mono mt-1 font-mono text-xs uppercase tracking-wider text-zinc-500">
                    {c.period_start as string} → {c.period_end as string}
                  </div>
                  <pre className="data-mono mt-2 font-mono text-xs text-zinc-300">
                    {JSON.stringify(c.value_json, null, 2)}
                  </pre>
                </div>
                <DataBadge tone={c.verification_tier === "plaid_payroll" ? "good" : "default"}>
                  {(c.verification_tier as string).toUpperCase()}
                </DataBadge>
              </CardBody>
            </Card>
          ))}
          {(credQ.data?.credentials ?? []).length === 0 ? (
            <div className="data-mono font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
              No credentials yet — upload a CSV above.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
