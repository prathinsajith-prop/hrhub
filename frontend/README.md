# HRHub Frontend

React 19 + Vite 8 + Tailwind 4 + shadcn/ui + TanStack Query + i18next.

## Requirements

- Node.js 20+
- pnpm 10.30+
- A running backend at `VITE_API_URL` (default: `/api/v1` proxied to `http://localhost:4000`)

## Setup

```bash
cp .env.example .env
pnpm install
pnpm dev            # http://localhost:5174
```

## Scripts

| Script                 | Purpose                                   |
|------------------------|-------------------------------------------|
| `pnpm dev`             | Vite dev server with HMR                  |
| `pnpm build`           | Production bundle → `dist/`               |
| `pnpm preview`         | Preview the production build              |
| `pnpm test`            | Vitest tests (jsdom)                      |
| `pnpm lint`            | Biome lint                                |

## Project layout

```
src/
  App.tsx                Router, lazy-loaded pages, QueryClient
  main.tsx               Entry, i18n init
  components/
    ui/                  shadcn-style primitives (Card, Button, …)
    shared/              App-level widgets (KpiCard, EmptyState, …)
    layout/              PageWrapper, PageHeader, AuthLayout, AppSidebar
  pages/<domain>/        Route-level components
  hooks/                 TanStack Query hooks per domain
  lib/                   api client, schemas (Zod), utils
  locales/               en.json / ar.json
  store/                 zustand stores (auth, ui)
```

## Authentication

- JWT in memory; refresh token in httpOnly-ish storage; silent refresh on 401.
- On refresh failure, the user is redirected to `/login`.
- See [src/lib/api.ts](src/lib/api.ts) for the retry/refresh flow.

## i18n

- English (default) and Arabic.
- All visible copy uses `t('key', { defaultValue: '...' })`.
- Arabic applies `dir="rtl"` on `<html>` automatically.

## Deploy

Build and serve through nginx via Docker:

```bash
docker build -t hrhub-web -f frontend/Dockerfile frontend
docker run -p 8080:80 hrhub-web
```

The nginx config in [nginx.conf](nginx.conf) handles SPA fallback, long-cache
for hashed assets, and basic security headers. Set `VITE_API_URL` at build time
to point at the deployed API, e.g.:

```bash
docker build --build-arg VITE_API_URL=https://api.hrhub.ae/api/v1 \
  -t hrhub-web -f frontend/Dockerfile frontend
```

## Testing

Vitest + Testing Library. Existing tests live in [src/__tests__/](src/__tests__/).
Add new tests alongside the code they cover.
