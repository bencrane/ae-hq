# platform-api — Bun + Hono BFF. Railway builds this from the repo root
# (`docker build -f apps/platform-api/Dockerfile <repo-root>`).
# Plain classic Dockerfile — no BuildKit-only features (Railway's builder
# rejects `RUN --mount`); install runs uncached, which is fine.

# ── build: install the workspace + bundle the BFF ──────────────────────────
# bun reads the ROOT package.json (workspaces: apps/*, packages/*) and uses
# its isolated install layout: every workspace member gets its own
# node_modules/ with relative symlinks into the shared node_modules/.bun/
# store. The whole repo is copied in first so every member's package.json is
# present — bun then installs ALL workspace dependencies in one pass.
# `bun build --target=bun` produces a single self-contained bundle, so the
# runtime stage needs no node_modules at all.
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN cd apps/platform-api && \
    bun build src/index.ts --target=bun --outdir=dist --minify

# ── runtime: run the bundled BFF ───────────────────────────────────────────
# The bundle is fully self-contained (no bare requires) — no node_modules
# copied. env is read at runtime via a lazy Proxy (src/env.ts): no build-time
# secrets. Railway injects PORT; src/env.ts honours it (default 8080).
FROM oven/bun:1.3-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/platform-api/dist ./dist
EXPOSE 8080
CMD ["bun", "run", "dist/index.js"]
