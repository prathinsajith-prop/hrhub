# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────
# HRHub frontend — React + Vite static build served via nginx
# ─────────────────────────────────────────────────────────────

ARG NODE_VERSION=20-alpine
ARG NGINX_VERSION=1.27-alpine

# ───── 1. build: Vite production bundle ─────
FROM node:${NODE_VERSION} AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .

# Optional build-time API URL override
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}

RUN pnpm build

# ───── 2. serve: nginx with SPA fallback ─────
FROM nginx:${NGINX_VERSION} AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
