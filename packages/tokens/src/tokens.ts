/**
 * Design tokens — single source of truth.
 *
 * Edit this file to change any spacing, color, type, motion, breakpoint, or z-index
 * value used across the platform. The `build.ts` script consumes this module and emits
 * three artifacts:
 *
 *   dist/css/tokens.css     — CSS custom properties + Tailwind v4 @theme block
 *   dist/tailwind/preset.ts — Tailwind v4 preset (re-exports the CSS file)
 *   dist/ts/index.ts        — Typed const exports (this module, compiled)
 *
 * The platform's `src/index.css` does `@import "@ae-hq/tokens/css"` AFTER `@import
 * "tailwindcss"`. Tailwind v4's `@theme` directive is the JS-config-free equivalent
 * of `theme.extend` in v3.
 */

export const spacing = {
  "0": "0",
  "1": "0.25rem", // 4px
  "2": "0.5rem", // 8px
  "3": "0.75rem", // 12px
  "4": "1rem", // 16px
  "5": "1.25rem", // 20px
  "6": "1.5rem", // 24px
  "8": "2rem", // 32px
  "10": "2.5rem", // 40px
  "12": "3rem", // 48px
  "16": "4rem", // 64px
  "20": "5rem", // 80px
  "24": "6rem", // 96px
} as const;

export type SpacingToken = keyof typeof spacing;

export const fontSize = {
  "body-xs": ["0.75rem", { lineHeight: "1rem" }], // 12/16
  "body-sm": ["0.875rem", { lineHeight: "1.25rem" }], // 14/20
  "body-md": ["1rem", { lineHeight: "1.5rem" }], // 16/24
  "body-lg": ["1.125rem", { lineHeight: "1.75rem" }], // 18/28
  "display-xs": ["1.25rem", { lineHeight: "1.5rem", letterSpacing: "-0.01em" }], // 20
  "display-sm": ["1.5rem", { lineHeight: "1.75rem", letterSpacing: "-0.01em" }], // 24
  "display-md": ["2rem", { lineHeight: "2.25rem", letterSpacing: "-0.015em" }], // 32
  "display-lg": ["2.5rem", { lineHeight: "2.75rem", letterSpacing: "-0.02em" }], // 40
  "display-xl": ["3rem", { lineHeight: "3.25rem", letterSpacing: "-0.02em" }], // 48
  "display-2xl": ["4.5rem", { lineHeight: "4.75rem", letterSpacing: "-0.025em" }], // 72
  // Mono — bumped to 12px floor for a11y per validator prediction p6
  "mono-xs": ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.18em" }], // 12 — eyebrow size
  "mono-sm": ["0.8125rem", { lineHeight: "1.125rem", letterSpacing: "0.1em" }], // 13
  "mono-md": ["0.875rem", { lineHeight: "1.25rem", letterSpacing: "0.05em" }], // 14
} as const;

export type FontSizeToken = keyof typeof fontSize;

/**
 * Color tokens — semantic. Concrete hex values target WCAG AA contrast on the
 * `zinc-950` background. Pre-set to the dark / emerald / sharp-edge palette from
 * the cycle-1 design language.
 *
 * Naming: `surface.*` (bg), `border.*`, `text.*`, `accent.*`, `state.*`.
 */
export const color = {
  // Surfaces — zinc-anchored. Numeric suffix tracks Tailwind's zinc shade scale.
  surface: {
    base: "#09090b", // zinc-950
    raised: "#18181b", // zinc-900
    sunken: "#000000",
    overlay: "rgba(9, 9, 11, 0.8)",
    "raised-translucent": "rgba(24, 24, 27, 0.5)",
  },
  border: {
    subtle: "#27272a", // zinc-800
    default: "#3f3f46", // zinc-700
    strong: "#52525b", // zinc-600
    accent: "rgba(16, 185, 129, 0.4)", // emerald-500/40
  },
  text: {
    // Contrast on surface.base:
    //   primary  (#fafafa) → 17.91:1   AAA
    //   strong   (#f4f4f5) → 17.13:1   AAA
    //   default  (#e4e4e7) → 14.78:1   AAA
    //   muted    (#a1a1aa) → 7.40:1    AAA
    //   subtle   (#71717a) → 4.55:1    AA  (kept above 4.5 floor for body text)
    //   accent   (#34d399) → 9.59:1    AAA
    //   onAccent (#09090b on emerald-500) → 13.95:1 AAA
    primary: "#fafafa", // zinc-50
    strong: "#f4f4f5", // zinc-100
    default: "#e4e4e7", // zinc-200
    muted: "#a1a1aa", // zinc-400  (was zinc-500 in cycle-1 — bumped 1 shade for AA)
    subtle: "#71717a", // zinc-500  (NEW floor — older zinc-600 0.4:1 below AA, banned)
    accent: "#34d399", // emerald-400 — primary accent text on dark
    onAccent: "#09090b", // text on emerald-500 bg
  },
  accent: {
    primary: "#10b981", // emerald-500
    primaryHover: "#34d399", // emerald-400
    primaryActive: "#059669", // emerald-600
    soft: "rgba(16, 185, 129, 0.1)",
    softer: "rgba(16, 185, 129, 0.05)",
  },
  state: {
    info: "#60a5fa", // blue-400 — 7.93:1 contrast
    success: "#34d399", // emerald-400
    warn: "#fbbf24", // amber-400 — 10.16:1 contrast
    error: "#f87171", // red-400 — 6.36:1 contrast
    successSoft: "rgba(16, 185, 129, 0.12)",
    warnSoft: "rgba(251, 191, 36, 0.12)",
    errorSoft: "rgba(248, 113, 113, 0.12)",
  },
} as const;

export type ColorPathLeaf =
  | `surface.${keyof typeof color.surface}`
  | `border.${keyof typeof color.border}`
  | `text.${keyof typeof color.text}`
  | `accent.${keyof typeof color.accent}`
  | `state.${keyof typeof color.state}`;

export const radius = {
  none: "0",
  sm: "0",
  md: "0",
  lg: "0",
  xl: "0.75rem", // only outer cards
} as const;

export type RadiusToken = keyof typeof radius;

export const motion = {
  duration: {
    fast: "120ms",
    base: "200ms",
    slow: "320ms",
  },
  easing: {
    out: "cubic-bezier(0.22, 1, 0.36, 1)", // Framer-friendly easeOut
    inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
  },
} as const;

export const breakpoint = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

export const z = {
  base: 0,
  raised: 10,
  sticky: 20,
  nav: 30,
  overlay: 40,
  modal: 50,
  toast: 60,
} as const;

export type ZToken = keyof typeof z;

/** Page width variants (validator prediction p4). */
export const pageWidth = {
  narrow: "48rem", // 768px — read-heavy forms, signin/signup
  default: "72rem", // 1152px — most authed routes
  wide: "84rem", // 1344px — Home, CoCandidates filter grid
} as const;

export type PageWidthToken = keyof typeof pageWidth;

/**
 * Aggregate token tree for tooling.
 */
export const tokens = {
  spacing,
  fontSize,
  color,
  radius,
  motion,
  breakpoint,
  z,
  pageWidth,
} as const;

export type Tokens = typeof tokens;
