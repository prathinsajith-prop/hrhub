# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────
# HRHub Portal Backend — Fastify + Drizzle (read mostly)
# Multi-stage build for a small, reproducible production image.
#
# NOTE: This service does NOT run database migrations — the schema is owned by
# the main backend (see migrations/ over there). The portal only reads/writes
# the same tables through its duplicated schema mirrors in src/db/schema/.
# ─────────────────────────────────────────────────────────────

ARG NODE_VERSION=24-alpine

# ───── 1. deps: install all deps (including dev) for the build stage ─────
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

# ───── 3. prod-deps: prune dev deps from the full install ─────
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.0 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./
RUN pnpm prune --prod

# ───── 4. runtime: minimal image ─────
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4001 \
    HOST=0.0.0.0

# Run as non-root
RUN addgroup -S app && adduser -S app -G app
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --chown=app:app package.json ./
COPY --chown=app:app entrypoint.sh ./
RUN chmod +x entrypoint.sh

USER app
EXPOSE 4001

# Node 24 has a global fetch() — more reliable than wget/busybox.
# Honour Railway's injected PORT if present; otherwise fall back to 4001.
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "entrypoint.sh"]
