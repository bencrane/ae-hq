import { type FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Page,
  PageHeader,
  Card,
  CardBody,
  CardHeader,
  Button,
  Field,
  Input,
  Stack,
  Badge,
} from "@ae-hq/ui";

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
    <Page variant="narrow">
      <PageHeader section="01" eyebrow="01 // EDIT_PROFILE" title="Profile" />
      <Card>
        <CardHeader>
          <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)]">
            {">"} update
          </div>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit}>
            <Stack gap="4">
              <Field label="Headline" htmlFor="profile-headline">
                <Input
                  id="profile-headline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  maxLength={140}
                />
              </Field>
              <Field label="LinkedIn URL" htmlFor="profile-linkedin">
                <Input
                  id="profile-linkedin"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={saveM.isPending} data-testid="save-profile">
                {saveM.isPending ? "Saving..." : "Save profile"}
              </Button>
              {saveM.isSuccess ? <Badge tone="good">SAVED</Badge> : null}
            </Stack>
          </form>
        </CardBody>
      </Card>
    </Page>
  );
}
