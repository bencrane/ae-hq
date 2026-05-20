# platform-app — Vite + React SPA. Railway builds this from the repo root
# (`docker build -f apps/platform-app/Dockerfile <repo-root>`).
# Plain classic Dockerfile — no BuildKit-only features (Railway's builder
# rejects `RUN --mount`); install runs uncached, which is fine.
#
# Vite bakes VITE_* env vars at BUILD time. Railway passes them as build-time
# variables ONLY because the build stage declares matching `ARG`s below. The
# image must build with placeholder values — no real secrets are baked here.

# ── build: install the workspace, build tokens, then build the Vite app ────
# bun reads the ROOT package.json (workspaces: apps/*, packages/*) and uses
# its isolated install layout: every workspace member gets its own
# node_modules/ with relative symlinks into node_modules/.bun/. The whole
# repo is copied in first so every member's package.json is present — bun
# then installs ALL workspace dependencies in one pass.
#
# @ae-hq/tokens is a BUILT package (main: ./dist/ts/index.js). @ae-hq/ui,
# src/index.css (`@import "@ae-hq/tokens/css"`) and the Tailwind preset all
# consume packages/tokens/dist/ — so tokens MUST be built before `vite build`.
# (@ae-hq/ui and @ae-hq/shared are source-only packages — no build step.)
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun run --filter @ae-hq/tokens build
WORKDIR /app/apps/platform-app
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_API_URL=$VITE_API_URL
RUN bun run build

# ── runtime: serve the static dist/ via Express (serve.js) ─────────────────
# serve.js (Express) listens on process.env.PORT — Railway injects it
# (default 5173). express is platform-app's only runtime dependency; it is
# installed fresh here (correct-arch, nothing else) BEFORE the app
# package.json is copied, so npm installs exactly express and not the app's
# full dev manifest. The app package.json is then copied for its
# "type": "module" — serve.js is an ES module.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN npm install --no-package-lock --no-save express@4.21.2
COPY --from=build /app/apps/platform-app/dist ./dist
COPY --from=build /app/apps/platform-app/serve.js ./serve.js
COPY --from=build /app/apps/platform-app/package.json ./package.json
EXPOSE 5173
CMD ["node", "serve.js"]
