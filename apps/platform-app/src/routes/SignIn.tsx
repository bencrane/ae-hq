import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
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

export function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: err, data } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    // Resolve where to land — candidate → /me, recruiter → /co
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL ?? "http://localhost:8080"}/api/v1/me`,
        {
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        },
      );
      if (res.ok) {
        const me = (await res.json()) as { profile?: { kind: string } };
        if (me.profile?.kind === "company_member") {
          navigate("/co");
          return;
        }
      }
    } catch {
      /* fall through */
    }
    navigate("/me");
  }

  return (
    <Page variant="narrow" align="center">
      <PageHeader section="01" title="Welcome back" />
      <Card>
        <CardHeader>
          <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)]">
            {">"} authenticate
          </div>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit}>
            <Stack gap="4">
              <Field label="Email" htmlFor="signin-email" required>
                <Input
                  id="signin-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Password" htmlFor="signin-password" required>
                <Input
                  id="signin-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {error ? <FormErrors errors={[{ message: error }]} /> : null}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Signing in..." : "Sign in"}
              </Button>
              <Link
                to="/signup"
                className="data-mono mt-2 text-center font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-accent)]"
              >
                No account? Sign up
              </Link>
            </Stack>
          </form>
        </CardBody>
      </Card>
    </Page>
  );
}
