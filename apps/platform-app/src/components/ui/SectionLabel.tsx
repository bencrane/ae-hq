import type { HTMLAttributes } from "react";
import { clsx } from "clsx";

export function SectionLabel({ index, children, className, ...rest }: HTMLAttributes<HTMLSpanElement> & { index: number }) {
  return (
    <span
      className={clsx(
        "data-mono font-mono text-xs uppercase tracking-[0.18em] text-emerald-400",
        className,
      )}
      {...rest}
    >
      {String(index).padStart(2, "0")} {"//"} {children}
    </span>
  );
}
