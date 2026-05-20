# Design System

The AE platform design system. Four layers, all enforced in CI.

- [Storybook](http://localhost:6006) (run `bun run storybook` to launch locally; built static site lives in `packages/ui/storybook-static/`)
- [Design decisions](./design-decisions.md)

## Layers

### Layer 0 — Tokens

Package: `packages/tokens/` (`@ae-hq/tokens`)

Single source of truth for every value the platform paints. Edit `packages/tokens/src/tokens.ts` and run `bun run --filter @ae-hq/tokens build` to regenerate three artifacts:

- `dist/css/tokens.css` — Tailwind v4 `@theme` block + CSS custom properties
- `dist/tailwind/preset.{ts,js,d.ts}` — Tailwind preset / token tree re-export
- `dist/ts/index.{js,d.ts}` — Typed const exports for Playwright assertions, etc.

The platform-app and Storybook both `@import "@ae-hq/tokens/css"` AFTER `@import "tailwindcss"`. Tailwind v4 reads the `@theme` block at build time — there is NO `tailwind.config.ts`.

#### Token domains

- `spacing` — 0, 1 (4px), 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24
- `fontSize` — `body-{xs,sm,md,lg}`, `display-{xs,sm,md,lg,xl,2xl}`, `mono-{xs,sm,md}`
- `color.{surface,border,text,accent,state}` — semantic palette
- `radius` — `none|sm|md|lg|xl` (first four are 0; xl is 0.75rem)
- `motion.{duration,easing}` — `fast/base/slow` + `out/inOut`
- `breakpoint` — sm/md/lg/xl/2xl
- `z` — base/raised/sticky/nav/overlay/modal/toast
- `pageWidth` — narrow (48rem), default (72rem), wide (84rem)

### Layer 1 — UI primitives

Package: `packages/ui/` (`@ae-hq/ui`)

Every primitive is token-typed. Spacing/color/font-size props accept token names, not raw values.

#### Layout

- `<Stack>` — vertical flex with gap (token)
- `<Inline>` — horizontal flex with gap (token)
- `<Grid>` — responsive grid (cols/mdCols/lgCols)
- `<Box>` — generic styled container (bg/border/color/p/px/py/rounded)
- `<Divider>` — `<hr>` (horizontal) or `<span aria-hidden>` (vertical)

#### Page

- `<Page>` — top-level container. `variant="narrow|default|wide|full"`. Owns geometry.
- `<PageHeader>` — eyebrow + title + description + actions. Tags eyebrow with `data-page-header-eyebrow` for the alignment verifier.
- `<PageBody>` — vertical rhythm between top-level sections
- `<PageSection>` — section eyebrow + title + actions + children
- `<PageActions>` — left/right-aligned button cluster
- `<PageBreadcrumbs>` — semantic breadcrumb nav
- `<PageEmptyState>` — title + description + actions, centered
- `<PageError>` — alert role + retry slot
- `<PageLoading>` — animated placeholder

#### Form

- `<Field>` — wraps label + description + control + error
- `<Label>` — for/required-aware label
- `<Input>` — single-line text input (invalid prop)
- `<Textarea>` — multiline (invalid prop)
- `<Select>` — native select with options-prop sugar
- `<Combobox>` — input + datalist autocomplete
- `<TagInput>` — multi-value chip input
- `<FieldGroup>` — `<fieldset>` + legend
- `<FormErrors>` — `role="alert"` error summary

#### Display

- `<Card>` + `<CardHeader>` + `<CardBody>` — rounded-xl container
- `<Badge>` — `tone="default|good|warn|muted|info"`
- `<Avatar>` — image or initials
- `<Stat>` — label + value + unit + optional delta
- `<KVTable>` — dl/dt/dd layout for definition rows
- `<DataTable>` — typed table with column.render slot
- `<Pagination>` — page/pageSize/total + onPageChange
- `<Spinner>` — animated `role="status"`
- `<SectionLabel>` — `<index> // <children>` eyebrow strip
- `<Button>` — `variant="primary|secondary|ghost|danger"` x `size="sm|md|lg"`

#### Feedback

- `<Banner>` — `<output>` + tone (info/success/warn/error)
- `<Toast>` — auto-dismissable transient banner
- `<Modal>` — accessible dialog with Esc + backdrop dismiss
- `<Drawer>` — side panel (left/right)
- `<Tooltip>` — hover/focus reveal

#### Jobs

- `<JobCard>` — a job card (portal variant); shows applied-state
- `<CollectionRow>` — horizontal-scrolling strip of job cards
- `<CollectionSection>` — a titled collection: heading + `CollectionRow`
- `<FunnelSummary>` — compact per-stage applicant breakdown for the jobs overview
- `<CompanyProfileHeader>` — company profile masthead (logo + firmographic facts)

#### Pipeline

- `<KanbanBoard>` — horizontal-scrolling kanban column container (owns drag context)
- `<KanbanColumn>` — one stage column (a dnd-kit droppable)
- `<KanbanCard>` — company-wide pipeline candidate card (cycle 3)
- `<ApplicantKanbanCard>` — per-job application card (cycle 5); subject is an `application`
- `<StageHeader>` — kanban column header (name + count + accent)
- `<CandidateTimeline>` / `<TimelineEntry>` — per-candidate activity feed

#### Motion

- `<AppearOnMount>` — opacity 0 → 1
- `<FadeIn>` — opacity 0 ↔ 1 with exit
- `<SlideIn>` — translate + opacity from a side

### Layer 2 — App shells

`apps/platform-app/src/components/`

- `TopNav` — public top strip
- `CandidateLayout` — left sidebar shell for `/me/*`
- `CompanyLayout` — left sidebar shell for `/co/*`

Shells own chrome (sidebar, top strip, scroll container). Content geometry is owned by `<Page>` inside each route.

### Layer 3 — Routes

`apps/platform-app/src/routes/`

Every route opens with `<Page>`. Section eyebrows + titles via `<PageHeader>` and `<PageSection>`. Cards / forms / badges / stats via the primitives.

## Enforcement

| Layer | Tool | Rule |
|-------|------|------|
| Routes | `@ae-hq/eslint-plugin-ae-hq` `no-route-geometry` | top-level JSX may not contain `mx-auto`, `max-w-*`, raw `px-*`, raw `py-*`, raw `gap-*`. Escape hatch: `unsafe_className` on `<Page>`. |
| Routes | `scripts/benchmarks/check-no-route-geometry.ts` (TS AST walker) | same rule, separate verifier — guards against ESLint plugin drift |
| Page geometry | `scripts/benchmarks/check-page-header-alignment.ts` | every authed route's `[data-page-header-eyebrow]` renders within ±2px of `/me` baseline |
| Storybook | `scripts/benchmarks/check-primitive-stories.ts` | every exported primitive has at least one story |
| Storybook | `scripts/benchmarks/check-storybook-a11y.ts` | axe-core: zero violations across every story |
| Docs | `scripts/benchmarks/check-design-system-doc.ts` | every primitive backtick-referenced in this doc |
| Types | `bun run typecheck` | `<Stack gap="6">` valid; `<Stack gap={42}>` is a compile error |

## When to add a primitive

1. The pattern appears in two or more routes
2. The pattern has a stable visual contract (not exploratory)
3. The pattern's API is clearly token-typed

If a one-off variant is genuinely needed, use the primitive's `unsafe_className` prop — but the route file itself should not own any of the geometry tokens listed above.

## Migrating a route

1. Start the route with `<Page variant="…">`. Narrow for forms (signin/signup/profile); default for most authed routes; wide for Home and CoCandidates.
2. Open with `<PageHeader section="01" title="…" description="…" />`. The `section` prop renders as the `01 // TITLE` eyebrow.
3. Replace ad-hoc grids with `<Grid>`, ad-hoc flex columns with `<Stack>`, ad-hoc flex rows with `<Inline>`.
4. Replace ad-hoc card/badge/stat markup with `<Card>`/`<Badge>`/`<Stat>`.
5. Replace bare `<input>` + `<label>` pairs with `<Field>` + `<Input>`.
6. Run `bun x tsx scripts/benchmarks/check-no-route-geometry.ts` — should report `0 top-level geometry violations`.
7. Run `bun run lint` — biome + the `no-route-geometry` rule both pass.

## Page width choices

| Variant | Width | Used by |
|---------|-------|---------|
| `narrow` | 48rem (768px) | SignIn, SignUp, MeProfile, MeIntent, NotFound, CoCompany |
| `default` | 72rem (1152px) | Me, MeCredentials, MeApprovals, Co, CoCandidateDetail, CoAts, CoBilling, JobDetail, CompanyPublic |
| `wide` | 84rem (1344px) | Home, CoCandidates |
| `full` | none | reserved for cycle 3 (messaging spine) |
