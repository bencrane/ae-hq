import { type ChangeEvent, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Page,
  PageHeader,
  PageSection,
  Card,
  CardBody,
  CardHeader,
  Button,
  Badge,
  Stack,
  SectionLabel,
} from "@ae-hq/ui";

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
          json: {
            filename: file.name,
            content_type: file.type || "text/csv",
            byte_size: file.size,
          },
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
    <Page>
      <PageHeader section="01" eyebrow="01 // CREDENTIALS" title="Verified record" />

      <Card>
        <CardHeader>
          <SectionLabel index={2}>UPLOAD_CSV</SectionLabel>
        </CardHeader>
        <CardBody>
          <Stack gap="4">
            <p className="text-body-sm text-[color:var(--color-text-muted)]">
              Upload a CSV from your CRM or quota dashboard. We&apos;ll parse it and add a
              credential.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFileChange}
              className="hidden"
              data-testid="credentials-csv"
            />
            <div>
              <Button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                data-testid="upload-csv-btn"
              >
                {uploading ? "Uploading..." : "Upload CSV"}
              </Button>
            </div>
            {lastPreview ? (
              <div className="data-mono rounded-none border border-[color:var(--color-border-accent)] bg-[color:var(--color-accent-softer)] p-4 font-mono text-mono-xs">
                <div className="mb-2 text-[color:var(--color-text-accent)]">PARSED</div>
                <pre className="whitespace-pre-wrap text-[color:var(--color-text-default)]">
                  {JSON.stringify(lastPreview, null, 2)}
                </pre>
              </div>
            ) : null}
          </Stack>
        </CardBody>
      </Card>

      <PageSection section="03" title="Your record">
        <Stack gap="3">
          {(credQ.data?.credentials ?? []).map((c) => (
            <Card key={c.id as string}>
              <CardBody>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="data-mono font-mono text-body-sm uppercase text-[color:var(--color-text-accent)]">
                      {c.kind as string}
                    </div>
                    <div className="data-mono mt-1 font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
                      {c.period_start as string} → {c.period_end as string}
                    </div>
                    <pre className="data-mono mt-2 font-mono text-mono-xs text-[color:var(--color-text-default)]">
                      {JSON.stringify(c.value_json, null, 2)}
                    </pre>
                  </div>
                  <Badge tone={c.verification_tier === "plaid_payroll" ? "good" : "default"}>
                    {(c.verification_tier as string).toUpperCase()}
                  </Badge>
                </div>
              </CardBody>
            </Card>
          ))}
          {(credQ.data?.credentials ?? []).length === 0 ? (
            <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
              No credentials yet — upload a CSV above.
            </div>
          ) : null}
        </Stack>
      </PageSection>
    </Page>
  );
}
