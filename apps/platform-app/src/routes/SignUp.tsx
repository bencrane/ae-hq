import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
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
  FormErrors,
  Stack,
} from "@ae-hq/ui";

export function SignUp() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [headline, setHeadline] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: err, data } = await supabase.auth.signUp({ email, password });
    if (err) {
      setError(err.message);
      setSubmitting(false);
      return;
    }
    if (data.session) {
      try {
        const res = await api.api.v1.candidates.onboard.$post({
          json: { headline: headline || "AE — fresh on AccountExecutive" },
        });
        if (!res.ok) {
          const j = (await res.json()) as { error?: { message?: string } };
          setError(j.error?.message ?? "onboard failed");
          setSubmitting(false);
          return;
        }
      } catch (e2) {
        setError(String(e2));
        setSubmitting(false);
        return;
      }
    }
    setSubmitting(false);
    navigate("/me");
  }

  return (
    <Page variant="narrow" align="center">
      <PageHeader section="01" title="Get started" />
      <Card>
        <CardHeader>
          <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)]">
            {">"} create_candidate_profile
          </div>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit}>
            <Stack gap="4">
              <Field label="Email" htmlFor="signup-email" required>
                <Input
                  id="signup-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Password" htmlFor="signup-password" required>
                <Input
                  id="signup-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field label="Headline" htmlFor="signup-headline">
                <Input
                  id="signup-headline"
                  type="text"
                  placeholder="Enterprise AE — 7yrs in fintech"
                  maxLength={140}
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                />
              </Field>
              {error ? <FormErrors errors={[{ message: error }]} /> : null}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create account"}
              </Button>
              <Link
                to="/signin"
                className="data-mono mt-2 text-center font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-accent)]"
              >
                Have an account? Sign in
              </Link>
            </Stack>
          </form>
        </CardBody>
      </Card>
    </Page>
  );
}
