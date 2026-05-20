import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  Page,
  PageHeader,
  Card,
  CardBody,
  Button,
  Badge,
  Field,
  Select,
  Stack,
  Inline,
} from "@ae-hq/ui";

export function CoCandidates() {
  const companiesQ = useQuery({
    queryKey: ["companies-for-filter"],
    queryFn: async () => {
      const res = await api.api.v1.jobs.$get({ query: { limit: "50" } });
      if (!res.ok) return { jobs: [] };
      return res.json();
    },
  });
  const [workedAt, setWorkedAt] = useState<string>("");
  const candQ = useQuery({
    queryKey: ["co", "candidates", workedAt],
    queryFn: async () => {
      const res = await api.api.v1.company.candidates.$get({
        query: workedAt ? { worked_at: workedAt, limit: "50" } : { limit: "50" },
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  type CompanyOpt = { id: string; name: string };
  const companyOpts: CompanyOpt[] = Array.from(
    new Map(
      ((companiesQ.data?.jobs ?? []) as Array<{ company: { id: string; name: string } | null }>)
        .map((j) => j.company)
        .filter((c): c is { id: string; name: string } => Boolean(c))
        .map((c) => [c.id, c]),
    ).values(),
  );

  return (
    <Page variant="wide">
      <PageHeader section="01" eyebrow="01 // CANDIDATES" title="Search" />

      <Card>
        <CardBody>
          <Inline gap="4" wrap align="end">
            <Field label="Worked at" htmlFor="filter-worked-at">
              <Select
                id="filter-worked-at"
                value={workedAt}
                onChange={(e) => setWorkedAt(e.target.value)}
                data-testid="filter-worked-at"
              >
                <option value="">ANY COMPANY</option>
                {companyOpts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Badge tone="muted">{candQ.data?.total ?? 0} RESULTS</Badge>
          </Inline>
        </CardBody>
      </Card>

      <Stack gap="3" unsafe_className="mt-6">
        {(candQ.data?.candidates ?? []).map((c) => (
          <Link key={c.id} to={`/co/candidates/${c.id}`} data-testid={`candidate-${c.id}`}>
            <Card interactive>
              <CardBody>
                <div className="flex items-center gap-4">
                  <div className="data-mono flex h-12 w-12 items-center justify-center rounded-xl bg-[color:var(--color-accent-soft)] font-mono text-body-md font-semibold text-[color:var(--color-text-accent)]">
                    {c.initials}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{c.headline ?? "AE"}</div>
                    <div className="data-mono mt-1 font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
                      {c.years_experience}yrs {"//"} {c.segment_focus ?? "—"} {"//"}{" "}
                      {c.methodology.join(", ") || "—"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.worked_at_companies.slice(0, 4).map((co) => (
                        <Badge key={co.id} tone="muted">
                          {co.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary">
                    View →
                  </Button>
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
        {candQ.data?.candidates?.length === 0 ? (
          <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
            No candidates match those filters.
          </div>
        ) : null}
      </Stack>
    </Page>
  );
}
