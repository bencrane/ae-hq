import { type FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Page,
  PageHeader,
  Card,
  CardBody,
  Button,
  Field,
  Input,
  Textarea,
  Stack,
} from "@ae-hq/ui";

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
    <Page variant="narrow">
      <PageHeader section="01" eyebrow="01 // COMPANY_PROFILE" title="Edit company" />
      <Card>
        <CardBody>
          <form onSubmit={onSubmit}>
            <Stack gap="4">
              <Field label="Name" htmlFor="co-name">
                <Input id="co-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Description" htmlFor="co-description">
                <Textarea
                  id="co-description"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={m.isPending}>
                {m.isPending ? "Saving..." : "Save"}
              </Button>
            </Stack>
          </form>
        </CardBody>
      </Card>
    </Page>
  );
}
