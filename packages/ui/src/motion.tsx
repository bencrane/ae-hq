/**
 * Motion primitives — token-bound wrappers around framer-motion.
 *
 * Durations + easings come from `@ae-hq/tokens` `motion.*`. Components default
 * to `motion.duration.base` and `motion.easing.out`.
 */

import { motion as motionTokens } from "@ae-hq/tokens";
import { type HTMLMotionProps, motion as fm } from "framer-motion";
import type { ReactNode } from "react";

type DurationKey = keyof typeof motionTokens.duration;
type EasingKey = keyof typeof motionTokens.easing;

function parseMs(s: string): number {
  return Number(s.replace("ms", ""));
}

function parseCubic(s: string): [number, number, number, number] {
  // "cubic-bezier(a, b, c, d)" → [a,b,c,d]
  const inside = s.replace(/^cubic-bezier\(/, "").replace(/\)$/, "");
  const parts = inside.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return [0.22, 1, 0.36, 1];
  }
  return parts as [number, number, number, number];
}

function transitionFor(d: DurationKey, e: EasingKey) {
  return {
    duration: parseMs(motionTokens.duration[d]) / 1000,
    ease: parseCubic(motionTokens.easing[e]),
  };
}

type MotionDivProps = Omit<HTMLMotionProps<"div">, "initial" | "animate" | "exit" | "transition">;

interface MotionWrapperProps extends MotionDivProps {
  duration?: DurationKey;
  easing?: EasingKey;
  delay?: number;
  children?: ReactNode;
}

// ────────────── AppearOnMount — opacity 0 → 1 ──────────────

export function AppearOnMount({
  duration = "base",
  easing = "out",
  delay = 0,
  children,
  ...rest
}: MotionWrapperProps) {
  return (
    <fm.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...transitionFor(duration, easing), delay }}
      {...rest}
    >
      {children}
    </fm.div>
  );
}

// ────────────── FadeIn — alias of AppearOnMount, exists for clarity ──────────────

export function FadeIn({
  duration = "base",
  easing = "out",
  delay = 0,
  children,
  ...rest
}: MotionWrapperProps) {
  return (
    <fm.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ ...transitionFor(duration, easing), delay }}
      {...rest}
    >
      {children}
    </fm.div>
  );
}

// ────────────── SlideIn — translate-y 8px + opacity 0 → 1 ──────────────

export interface SlideInProps extends MotionWrapperProps {
  from?: "top" | "bottom" | "left" | "right";
  distance?: number;
}

export function SlideIn({
  from = "bottom",
  distance = 8,
  duration = "base",
  easing = "out",
  delay = 0,
  children,
  ...rest
}: SlideInProps) {
  const offset =
    from === "top"
      ? { y: -distance }
      : from === "bottom"
        ? { y: distance }
        : from === "left"
          ? { x: -distance }
          : { x: distance };
  return (
    <fm.div
      initial={{ opacity: 0, ...offset }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ ...transitionFor(duration, easing), delay }}
      {...rest}
    >
      {children}
    </fm.div>
  );
}
