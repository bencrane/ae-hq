import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { SectionLabel } from "../components/ui/SectionLabel";
import { api } from "../lib/api";

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
    // If email confirmations off → we have a session and can onboard immediately
    if (data.session) {
      try {
        const res = await api.api.v1.candidates.onboard.$post({ json: { headline: headline || "AE — fresh on AccountExecutive" } });
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
    <div className="mx-auto max-w-md px-6 py-24">
      <SectionLabel index={1}>SIGN_UP</SectionLabel>
      <h1 className="font-display mt-4 text-4xl font-semibold tracking-tight">Get started</h1>
      <Card className="mt-8">
        <CardHeader>
          <div className="data-mono font-mono text-xs uppercase tracking-wider text-emerald-400">
            {">"} create_candidate_profile
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
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="data-mono font-mono text-xs uppercase tracking-wider text-zinc-400">Headline</span>
              <input
                type="text"
                placeholder="Enterprise AE — 7yrs in fintech"
                maxLength={140}
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            {error ? (
              <div className="data-mono font-mono text-xs uppercase tracking-wider text-amber-400">
                ERR {"//"} {error}
              </div>
            ) : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create account"}
            </Button>
            <Link to="/signin" className="data-mono mt-2 text-center font-mono text-xs uppercase tracking-wider text-zinc-400 hover:text-emerald-400">
              Have an account? Sign in
            </Link>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
