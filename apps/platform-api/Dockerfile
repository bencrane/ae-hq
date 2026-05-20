# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lock* ./
COPY apps/platform-api/package.json ./apps/platform-api/
COPY packages/shared/package.json ./packages/shared/
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile || bun install

FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/platform-api/node_modules ./apps/platform-api/node_modules 2>/dev/null || true
COPY . .
WORKDIR /app/apps/platform-api
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun build src/index.ts --target=bun --outdir=dist --minify

FROM oven/bun:1.3-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/platform-api/dist ./dist
COPY --from=build /app/apps/platform-api/package.json ./
COPY --from=deps /app/node_modules ./node_modules
EXPOSE 8080
CMD ["bun", "run", "dist/index.js"]
