import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { SectionLabel } from "../components/ui/SectionLabel";

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
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? "http://localhost:8080"}/api/v1/me`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
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
    <div className="mx-auto max-w-md px-6 py-24">
      <SectionLabel index={1}>SIGN_IN</SectionLabel>
      <h1 className="font-display mt-4 text-4xl font-semibold tracking-tight">Welcome back</h1>
      <Card className="mt-8">
        <CardHeader>
          <div className="data-mono font-mono text-xs uppercase tracking-wider text-emerald-400">
            {">"} authenticate
          </div>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="data-mono font-mono text-xs uppercase tracking-wider text-zinc-400">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="data-mono font-mono text-xs uppercase tracking-wider text-zinc-400">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            {error ? (
              <div className="data-mono font-mono text-xs uppercase tracking-wider text-amber-400">
                ERR {"//"} {error}
              </div>
            ) : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in"}
            </Button>
            <Link to="/signup" className="data-mono mt-2 text-center font-mono text-xs uppercase tracking-wider text-zinc-400 hover:text-emerald-400">
              No account? Sign up
            </Link>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
