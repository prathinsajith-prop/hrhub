# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────
# HRHub backend — Fastify + Drizzle + Postgres
# Multi-stage build for a small, reproducible production image
# ─────────────────────────────────────────────────────────────

ARG NODE_VERSION=24-alpine

# ───── 1. deps: install all deps (including dev) for build ─────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ───── 2. build: transpile TypeScript to dist/ ─────
FROM node:${NODE_VERSION} AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.0 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ───── 3. prod-deps: install production-only deps ─────
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ───── 4. runtime: minimal image ─────
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0

# Run as non-root
RUN addgroup -S app && adduser -S app -G app
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/migrations ./migrations
COPY --chown=app:app package.json ./

USER app
EXPOSE 4000

# Healthcheck uses the /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
