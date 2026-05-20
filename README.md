# ae-hq

AccountExecutive.com platform monorepo. Two-sided AE hiring marketplace.

## Layout

- `apps/platform-app` — Vite 6 + React 19 + Tailwind v4 SPA
- `apps/platform-api` — Bun + Hono 4 BFF
- `packages/shared` — zod schemas + Hono RPC type exports
- `packages/tokens` — design tokens (`@ae-hq/tokens`); single source of truth
- `packages/ui` — UI primitives (`@ae-hq/ui`) + Storybook
- `packages/eslint-plugin-ae-hq` — custom ESLint rules (`no-route-geometry`)
- `supabase/migrations` — SQL schema (RLS deny-all default; BFF uses service role)
- `seed/` — sample data generator
- `e2e/` — Playwright suite
- `scripts/benchmarks/cycle-1-criteria.sh` — cycle 1 verifier

## Design system

See [`docs/design-system.md`](./docs/design-system.md) for the four-layer design system (tokens → primitives → shells → routes) and [`docs/design-decisions.md`](./docs/design-decisions.md) for the ADRs.

```bash
bun run storybook         # primitive catalog on :6006
bun run storybook:build   # static build
```

## Quickstart (dev)

```bash
doppler login              # one-time
doppler setup --project hq-ae-dot-com --config dev
bun install
doppler run -- bun run db:reset    # drops + recreates schema, runs seed
doppler run -- bun run dev          # starts api on :8080 and app on :5173
```

Test users (after seed):

- candidate1@accountexecutive.test / testing123!
- recruiter1@stripe.test / testing123!

## Deploy

Railway services:

- `platform-app` (Dockerfile: `apps/platform-app/Dockerfile`) → `app.accountexecutive.com`
- `platform-api` (Dockerfile: `apps/platform-api/Dockerfile`) → `api.accountexecutive.com`

Doppler binds secrets to both services via `hq-ae-dot-com/prd`.

## Cycle 1 verifier

```bash
scripts/benchmarks/cycle-1-criteria.sh             # full
scripts/benchmarks/cycle-1-criteria.sh --skip-deploy --skip-lighthouse   # local
```

Exit 0 = cycle complete.
