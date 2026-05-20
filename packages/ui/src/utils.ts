/**
 * Shared utilities for primitive components.
 *
 * The token-prop mapping tables here are the **single point of contact** between
 * the design-token names and the Tailwind utility classes that Tailwind v4
 * generates from the `@theme` block in `@ae-hq/tokens/css`. If you add a new
 * spacing or font-size token to `packages/tokens/src/tokens.ts`, add the
 * corresponding mapping here.
 */

import { type ClassValue, clsx } from "clsx";

export function cx(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

// ───────────── spacing ─────────────

export type SpacingProp =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "8"
  | "10"
  | "12"
  | "16"
  | "20"
  | "24";

const GAP: Record<SpacingProp, string> = {
  "0": "gap-0",
  "1": "gap-1",
  "2": "gap-2",
  "3": "gap-3",
  "4": "gap-4",
  "5": "gap-5",
  "6": "gap-6",
  "8": "gap-8",
  "10": "gap-10",
  "12": "gap-12",
  "16": "gap-16",
  "20": "gap-20",
  "24": "gap-24",
};

const P: Record<SpacingProp, string> = {
  "0": "p-0",
  "1": "p-1",
  "2": "p-2",
  "3": "p-3",
  "4": "p-4",
  "5": "p-5",
  "6": "p-6",
  "8": "p-8",
  "10": "p-10",
  "12": "p-12",
  "16": "p-16",
  "20": "p-20",
  "24": "p-24",
};

const PX: Record<SpacingProp, string> = {
  "0": "px-0",
  "1": "px-1",
  "2": "px-2",
  "3": "px-3",
  "4": "px-4",
  "5": "px-5",
  "6": "px-6",
  "8": "px-8",
  "10": "px-10",
  "12": "px-12",
  "16": "px-16",
  "20": "px-20",
  "24": "px-24",
};

const PY: Record<SpacingProp, string> = {
  "0": "py-0",
  "1": "py-1",
  "2": "py-2",
  "3": "py-3",
  "4": "py-4",
  "5": "py-5",
  "6": "py-6",
  "8": "py-8",
  "10": "py-10",
  "12": "py-12",
  "16": "py-16",
  "20": "py-20",
  "24": "py-24",
};

const MT: Record<SpacingProp, string> = {
  "0": "mt-0",
  "1": "mt-1",
  "2": "mt-2",
  "3": "mt-3",
  "4": "mt-4",
  "5": "mt-5",
  "6": "mt-6",
  "8": "mt-8",
  "10": "mt-10",
  "12": "mt-12",
  "16": "mt-16",
  "20": "mt-20",
  "24": "mt-24",
};

const MB: Record<SpacingProp, string> = {
  "0": "mb-0",
  "1": "mb-1",
  "2": "mb-2",
  "3": "mb-3",
  "4": "mb-4",
  "5": "mb-5",
  "6": "mb-6",
  "8": "mb-8",
  "10": "mb-10",
  "12": "mb-12",
  "16": "mb-16",
  "20": "mb-20",
  "24": "mb-24",
};

export const space = { gap: GAP, p: P, px: PX, py: PY, mt: MT, mb: MB };

// ───────────── text color ─────────────

export type TextColorProp =
  | "primary"
  | "strong"
  | "default"
  | "muted"
  | "subtle"
  | "accent"
  | "onAccent";

export const textColor: Record<TextColorProp, string> = {
  primary: "text-[color:var(--color-text-primary)]",
  strong: "text-[color:var(--color-text-strong)]",
  default: "text-[color:var(--color-text-default)]",
  muted: "text-[color:var(--color-text-muted)]",
  subtle: "text-[color:var(--color-text-subtle)]",
  accent: "text-[color:var(--color-text-accent)]",
  onAccent: "text-[color:var(--color-text-onAccent)]",
};

// ───────────── surface bg ─────────────

export type SurfaceProp = "base" | "raised" | "sunken" | "raised-translucent";

export const surfaceBg: Record<SurfaceProp, string> = {
  base: "bg-[color:var(--color-surface-base)]",
  raised: "bg-[color:var(--color-surface-raised)]",
  sunken: "bg-[color:var(--color-surface-sunken)]",
  "raised-translucent": "bg-[color:var(--color-surface-raised-translucent)]",
};

// ───────────── border ─────────────

export type BorderProp = "subtle" | "default" | "strong" | "accent";

export const borderColor: Record<BorderProp, string> = {
  subtle: "border-[color:var(--color-border-subtle)]",
  default: "border-[color:var(--color-border-default)]",
  strong: "border-[color:var(--color-border-strong)]",
  accent: "border-[color:var(--color-border-accent)]",
};

// ───────────── font size ─────────────

export type FontSizeProp =
  | "body-xs"
  | "body-sm"
  | "body-md"
  | "body-lg"
  | "display-xs"
  | "display-sm"
  | "display-md"
  | "display-lg"
  | "display-xl"
  | "display-2xl"
  | "mono-xs"
  | "mono-sm"
  | "mono-md";

export const fontSize: Record<FontSizeProp, string> = {
  "body-xs": "text-body-xs",
  "body-sm": "text-body-sm",
  "body-md": "text-body-md",
  "body-lg": "text-body-lg",
  "display-xs": "text-display-xs",
  "display-sm": "text-display-sm",
  "display-md": "text-display-md",
  "display-lg": "text-display-lg",
  "display-xl": "text-display-xl",
  "display-2xl": "text-display-2xl",
  "mono-xs": "text-mono-xs",
  "mono-sm": "text-mono-sm",
  "mono-md": "text-mono-md",
};

// ───────────── width variants for Page ─────────────

export type PageVariantProp = "narrow" | "default" | "wide" | "full";

/**
 * Page width — explicit pixel values rather than arbitrary Tailwind utilities.
 * Tailwind's `max-w-N` arbitrary-value classes would re-introduce raw geometry
 * tokens at the route boundary, defeating the purpose of the design system.
 */
export const pageMaxWidth: Record<PageVariantProp, string> = {
  narrow: "max-w-[48rem]",
  default: "max-w-[72rem]",
  wide: "max-w-[84rem]",
  full: "max-w-none",
};

// ───────────── runtime token validation (dev-only) ─────────────

/**
 * Asserts a string union is one of the allowed token values at runtime in dev.
 * No-op in production. Provides better error messages than a TS error when
 * passing a value through `unknown`.
 */
export function assertTokenValue<T extends string>(
  value: T,
  allowed: readonly T[],
  context: string,
): void {
  if (process.env.NODE_ENV === "production") return;
  if (!allowed.includes(value)) {
    // eslint-disable-next-line no-console
    console.error(
      `[@ae-hq/ui] invalid token "${value}" passed to ${context}. ` +
        `allowed: ${allowed.join(", ")}`,
    );
  }
}
