# Design decisions (ADRs)

Architecture Decision Records for the design system. Each entry: context, decision, consequences.

---

## DD-001: Sharp edges everywhere except outer cards

**Context.** The AE marketing site uses sharp-edged buttons and badges for a Bloomberg-terminal feel. Rounded corners read as SaaS-friendly; sharp edges read as serious / data-dense.

**Decision.** Set `radius.{none, sm, md, lg}` to `0` and only `radius.xl` to `0.75rem`. Cards use `rounded-xl`. Everything else (buttons, badges, inputs, modals' inner header borders, table cells) is `rounded-none`.

**Consequences.** Designers must consciously override to add roundness — there's no "let me round this a touch" knob. Sharp edges are the default, not an override.

---

## DD-002: Playfair Display for headers, Geist Sans for body, Geist Mono for data

**Context.** The cycle-1 design language pinned this triad. The visual contract is: serif display headers (confident, editorial) + geometric sans body (clean) + monospace data (Bloomberg).

**Decision.** Three font families, exposed as `--font-display`, `--font-sans`, `--font-mono` CSS variables. Tailwind v4 reads them via `@theme`. Headers (`h1/h2/h3`, `font-display` class) use Playfair. Body inherits Geist Sans. Anything with class `data-mono` or `font-mono` uses Geist Mono.

**Consequences.** Date fields, OTE values, stage labels, eyebrow strips ALL use `font-mono`. Numbers are tabular by default in `<Stat>`. The terminal aesthetic falls out of the type choice; no extra effort needed.

---

## DD-003: Page primitive owns route geometry — routes describe content

**Context.** Cycle-1's 17 routes each authored their own `mx-auto max-w-{3xl|4xl|5xl|6xl|7xl} px-6 py-12`. Result: the content's left edge shifted by ~190px between pages. Consistent cross-route geometry is uncorrectable when each route owns its own width.

**Decision.** Routes open with `<Page variant="narrow|default|wide|full">`. `<Page>` owns the `mx-auto`, the `max-w-{48rem|72rem|84rem|none}`, and the `px-6 lg:px-8 py-12` rhythm. Routes describe content only.

Enforced by:
- ESLint rule `ae-hq/no-route-geometry` — bans the banned classes on top-level JSX
- TS AST verifier `scripts/benchmarks/check-no-route-geometry.ts` — same rule, separate verifier
- Playwright `check-page-header-alignment.ts` — asserts ±2px eyebrow x/y alignment across all authed routes

**Consequences.** Three width variants cover the entire current platform. A "fourth" variant means real product motivation — adding one is a small commit (token + variant in `pageMaxWidth`); abusing `unsafe_className` is the anti-pattern.

---

## DD-004: Tokens distributed via CSS `@theme`, not a JS Tailwind preset

**Context.** Tailwind v4 changed the configuration model. Cycle-1 platform-app uses Tailwind v4 beta with `@tailwindcss/vite`. There is NO `tailwind.config.ts`. Token consumption happens via the `@theme` directive inside CSS.

A JS preset (`packages/tokens/dist/tailwind/preset.ts`) is emitted for tools that introspect the token tree (e.g. Playwright assertions, Storybook docs), but it is NOT loaded by Tailwind itself.

**Decision.** `packages/tokens/build.ts` emits `dist/css/tokens.css` containing a single `@theme` block. The platform-app's `src/index.css` does `@import "tailwindcss"; @import "@ae-hq/tokens/css";` in that order. Tailwind's PostCSS pass (via `@tailwindcss/vite`) reads the `@theme` and generates utilities.

**Consequences.** No JS preset means no `tailwind.config.ts` to maintain. Editing tokens means editing `tokens.ts` + running `bun run --filter @ae-hq/tokens build`. Storybook reads the same CSS via its preview.css. Tooling that needs typed token access imports from `@ae-hq/tokens` (re-exported `dist/ts/index.js`).

---

## DD-005: Mono text floors at 12px for WCAG AA contrast

**Context.** Cycle-1 used `text-[10px]` for eyebrow strips. Tiny text at low contrast fails axe-core's color-contrast rule and is harder to read for users with low vision.

**Decision.** The smallest mono token (`mono-xs`) is 12px (0.75rem). All eyebrow strips (`SectionLabel`, `PageHeader` eyebrow, `Label`, badge text) use `mono-xs` or larger. The `text-[10px]` and `text-[11px]` patterns from cycle-1 are flagged as deprecated and migrated to `mono-xs`.

**Consequences.** Eyebrow strips are slightly more prominent than cycle-1. Letter-spacing (`0.18em`) compensates — the strips still read as eyebrows, not as body text.

---

## DD-006: Color tokens land above WCAG AA contrast on the zinc-950 background

**Context.** Cycle-1's `text-zinc-500` (the "muted" body text color) sits at 4.1:1 contrast on `bg-zinc-950` — just below WCAG AA's 4.5:1 floor. Cycle-1 also used `text-zinc-600` in places (3.4:1, fails AA).

**Decision.** Re-mapped the text-color tokens to AA-safe shades:
- `text.muted` → zinc-400 (`#a1a1aa`, 7.40:1)
- `text.subtle` → zinc-500 (`#71717a`, 4.55:1) — the new floor; below this we don't go
- `text.default` → zinc-200 (`#e4e4e7`, 14.78:1)
- `text.strong` → zinc-100 (`#f4f4f5`, 17.13:1)
- `text.primary` → zinc-50 (`#fafafa`, 17.91:1)

All values calculated against `surface.base` (`#09090b`).

**Consequences.** The platform reads slightly brighter than cycle-1 in places. axe-core passes with `color-contrast: enabled`. Designers may not use `zinc-600` or darker for any text element.

---

## DD-007: Biome stays as primary linter; ESLint scoped to custom AST rules

**Context.** The directive asked for an ESLint plugin `eslint-plugin-ae-hq` shipping the `no-route-geometry` rule. The project's existing lint is biome.

**Decision.** Both linters run. `bun run lint` is `biome check {new packages} && eslint apps/platform-app/src/routes/**/*.tsx`. ESLint exists ONLY to host custom AST rules (currently one). Biome handles formatting + the broad ruleset.

Biome's scope is restricted to the new packages because cycle-1's pre-existing code wasn't biome-clean (organizeImports + format diffs); fixing those is out of scope for cycle-2. Cycle 3 should widen the biome scope as it touches more files.

**Consequences.** Two linters, two formats of output. The verifier script tests both: planted-violation probe in a route triggers the ESLint rule. The biome scope is documented above and in `package.json` so cycle 3 inherits the boundary explicitly.

---

## DD-008: `unsafe_className` is the explicit escape hatch — not `className`

**Context.** Most primitive APIs let consumers pass an arbitrary `className` to override styles. This breaks the design system contract — once an arbitrary class can land, the geometry guarantee dies.

**Decision.** Primitive props are token-typed (e.g. `gap?: SpacingProp`). For the rare case where a route genuinely needs a one-off, the primitive accepts `unsafe_className`. The name is intentionally awkward: it signals to reviewers + future authors that the route is opting OUT of the system.

The `no-route-geometry` ESLint rule + AST verifier IGNORE `unsafe_className` — the escape hatch works.

**Consequences.** Reviewers can `grep unsafe_className` to find every opt-out in routes. The count should stay low; if it grows, the primitive surface needs expansion, not more escapes.
