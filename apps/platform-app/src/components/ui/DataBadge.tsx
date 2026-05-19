import type { HTMLAttributes } from "react";
import { clsx } from "clsx";

type Tone = "default" | "good" | "warn" | "muted";

const tones: Record<Tone, string> = {
  default: "bg-zinc-900 text-zinc-200 border-zinc-800",
  good: "bg-emerald-900/30 text-emerald-300 border-emerald-700/50",
  warn: "bg-amber-900/30 text-amber-300 border-amber-700/50",
  muted: "bg-zinc-900/60 text-zinc-500 border-zinc-800",
};

export function DataBadge({
  tone = "default",
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={clsx(
        "data-mono inline-flex items-center gap-1 rounded-none border px-2 py-0.5 font-mono text-xs uppercase tracking-wider",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
