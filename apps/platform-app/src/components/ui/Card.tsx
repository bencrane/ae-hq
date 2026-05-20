import { type HTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={clsx(
        "rounded-xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, children, ...rest }, ref) {
    return (
      <div ref={ref} className={clsx("border-b border-zinc-800 px-6 py-4", className)} {...rest}>
        {children}
      </div>
    );
  },
);

export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardBody({ className, children, ...rest }, ref) {
    return (
      <div ref={ref} className={clsx("px-6 py-4", className)} {...rest}>
        {children}
      </div>
    );
  },
);
