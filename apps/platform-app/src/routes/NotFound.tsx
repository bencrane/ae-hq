import { Link } from "react-router-dom";
import { SectionLabel } from "../components/ui/SectionLabel";

export function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-32 text-center">
      <SectionLabel index={4}>404</SectionLabel>
      <h1 className="font-display mt-4 text-6xl font-semibold tracking-tight">Not found</h1>
      <p className="mt-6 text-zinc-400">The page you were looking for has been closed.</p>
      <Link
        to="/"
        className="data-mono mt-8 inline-block font-mono text-xs uppercase tracking-wider text-emerald-400 hover:text-emerald-300"
      >
        ← Back to home
      </Link>
    </div>
  );
}
