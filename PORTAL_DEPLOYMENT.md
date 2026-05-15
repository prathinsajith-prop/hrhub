# Portal deployment guide

The portal is a pair of services that share the **same database, S3 bucket, and JWT secrets** as the main HRHub app. Both services can deploy independently.

| Service             | Path              | Host    | Port (local) | Domain (suggested)              |
| ------------------- | ----------------- | ------- | ------------ | ------------------------------- |
| Portal backend API  | `backend-portal/` | Railway | `4001`       | `api-portal.hrhub.ae`           |
| Portal frontend SPA | `frontend-portal/`| Vercel  | `5175`       | `portal.hrhub.ae`               |

The existing `backend/` (Railway) and `frontend/` (Vercel) deployments are **not touched** by any of this — the portal services are siblings.

---

## 1. Backend portal — Railway

### One-time setup

1. **New Railway service** in the same project as the main backend.
2. **Settings → Source** → point at the `backend-portal/` directory of this repo.
3. **Settings → Deploy** → leave the **Start Command empty**. `railway.toml` provides `sh entrypoint.sh`.
4. **Settings → Networking** → enable a public domain (`*.railway.app`), then attach a custom domain (e.g. `api-portal.hrhub.ae`).

### Required environment variables

| Var                          | Value                                                 |
| ---------------------------- | ----------------------------------------------------- |
| `NODE_ENV`                   | `production`                                          |
| `PORT`                       | `4001`                                                |
| `HOST`                       | `0.0.0.0`                                             |
| `DATABASE_URL`               | **Identical** to main backend's `DATABASE_URL`        |
| `JWT_SECRET`                 | **Identical** to main backend (tokens interchangeable)|
| `REFRESH_TOKEN_SECRET`       | **Identical** to main backend                         |
| `JWT_EXPIRES_IN`             | `15m`                                                 |
| `REFRESH_TOKEN_EXPIRES_IN`   | `7d`                                                  |
| `CORS_ORIGINS`               | `https://portal.hrhub.ae` (comma-separate for staging)|
| `APP_URL`                    | `https://portal.hrhub.ae` (used in reset-password emails)|
| `EMAIL_PROVIDER`             | `gmail` / `resend` / `smtp`                           |
| `EMAIL_FROM`                 | same as main                                          |
| `EMAIL_FROM_NAME`            | `HRHub Portal`                                        |
| `GMAIL_USER`                 | same as main (if EMAIL_PROVIDER=gmail)                |
| `GMAIL_APP_PASSWORD`         | same as main                                          |
| `S3_ENDPOINT`                | same as main                                          |
| `S3_BUCKET`                  | same as main                                          |
| `S3_ACCESS_KEY`              | same as main                                          |
| `S3_SECRET_KEY`              | same as main                                          |
| `S3_PUBLIC_URL`              | same as main                                          |
| `LOG_LEVEL`                  | `info` (or `debug` to enable Drizzle query logging)   |

### Why the secrets must be identical

JWT_SECRET and REFRESH_TOKEN_SECRET are intentionally shared so tokens issued by **either backend** are accepted by **both**. This lets a single sign-in cookie/token work across the admin app and the portal. If you rotate one, rotate both.

### What this service does NOT do

- **Migrations** — the schema is owned by `backend/`. Always deploy the main backend's migration first, then update the portal's schema mirror, then deploy the portal. See `entrypoint.sh` for the inline reminder.
- **Background workers** — no BullMQ here. Payroll, expiry alerts, etc. remain with the main backend.
- **2FA setup / TOTP enrolment** — users with 2FA enabled must sign in via the admin app. The portal blocks 2FA logins with HTTP 412.

### Health check

`GET /health` returns `{status: "ok", service: "backend-portal", timestamp: ...}`. Railway's `railway.toml` references this path with a 30-second timeout.

---

## 2. Frontend portal — Vercel

### One-time setup

1. **New Vercel project** → Import Git repo → **Root Directory: `frontend-portal/`**.
2. Vercel auto-detects Vite (also explicitly set in `vercel.json`).
3. **Build command:** `pnpm build` (set by `vercel.json`).
4. **Install command:** `pnpm install --frozen-lockfile` (set by `vercel.json`).
5. **Output directory:** `dist` (set by `vercel.json`).
6. Add a custom domain (e.g. `portal.hrhub.ae`).

### Required environment variables (Vercel dashboard)

| Var                    | Value                                              |
| ---------------------- | -------------------------------------------------- |
| `VITE_API_URL`         | `https://api-portal.hrhub.ae/api/v1` (whatever your portal-backend Railway URL is, **with the `/api/v1` suffix**) |
| `VITE_ADMIN_APP_URL`   | `https://hrhub-alpha.vercel.app` (or your admin Vercel URL) |
| `VITE_APP_NAME`        | `HRHub Portal` (optional, default applies)         |

### SPA routing (already configured in `vercel.json`)

```json
"rewrites": [
  { "source": "/((?!api/|favicon\\.svg|assets/).*)", "destination": "/index.html" }
]
```

This sends any deep-link (e.g. `/me/leave`) back to `index.html` so React Router handles routing client-side. The exclusions (`api/`, `favicon.svg`, `assets/`) keep static asset requests fast.

### Long-cache for hashed assets (already in `vercel.json`)

Vite emits `assets/index-<hash>.js` and `assets/charts-<hash>.js`. The `Cache-Control: public, max-age=31536000, immutable` header on `/assets/*` means the browser caches them forever — a re-deploy gets a new hash and breaks the cache automatically.

---

## 3. Deploy order

When updating both services, deploy in this order to avoid version skew:

1. **Schema change?** Deploy `backend/` first (so the migration runs).
2. Deploy `backend-portal/` (with mirrored schema if it changed).
3. Deploy `frontend-portal/` last (since it depends on the backend's API shape).

If the change is frontend-only (UI), step 3 alone is fine.

---

## 4. Verification checklist

Once both services are live:

```bash
# 1. Portal backend is healthy
curl https://api-portal.hrhub.ae/health
# expect: {"status":"ok","service":"backend-portal",...}

# 2. CORS is correctly configured for the frontend origin
curl -i -X OPTIONS https://api-portal.hrhub.ae/api/v1/auth/login \
     -H "Origin: https://portal.hrhub.ae" \
     -H "Access-Control-Request-Method: POST"
# expect: HTTP 204, access-control-allow-origin: https://portal.hrhub.ae

# 3. Tokens issued by the MAIN backend work on the portal backend
T=$(curl -s -X POST https://<main-backend>/api/v1/auth/login \
        -H "Content-Type: application/json" \
        -d '{"email":"...","password":"..."}' | jq -r '.data.accessToken')
curl https://api-portal.hrhub.ae/api/v1/employees/me \
     -H "Authorization: Bearer $T"
# expect: 200 with employee data

# 4. SPA deep-link works
curl -I https://portal.hrhub.ae/me/leave
# expect: HTTP 200, content-type: text/html (the index.html, not 404)
```

---

## 5. Files Railway / Vercel rely on (do NOT delete)

### `backend-portal/`

- `Dockerfile` — multi-stage build, runs as non-root user.
- `entrypoint.sh` — single-line start (no migrations).
- `railway.toml` — points at the Dockerfile + health check.
- `.dockerignore` — keeps the build context small.
- `package.json` + `pnpm-lock.yaml` — locked deps.
- `.env.example` — env var reference (not loaded by Railway, only for docs).

### `frontend-portal/`

- `vercel.json` — Vite framework hint + SPA rewrites + cache headers.
- `package.json` + `pnpm-lock.yaml` — locked deps.
- `vite.config.ts` — build config + manualChunks for cacheable chunks.
- `tsconfig*.json` — TypeScript config used by the `pnpm build` step.
- `public/favicon.svg` — served from root.
- `index.html` — entry HTML with all favicon + PWA meta tags.
- `.env.example` — env var reference.

---

## 6. Things that could bite you on first deploy

1. **CORS origin missing** — if you only set `https://portal.hrhub.ae` in CORS but Vercel also serves a preview URL (e.g. `portal-git-main-yourteam.vercel.app`), preview deployments will be blocked. Add preview domains too, or use `*` for staging only.

2. **JWT_SECRET mismatch** — silently breaks token interop. The portal will return 401 for tokens minted by the main backend. Triple-check both are byte-identical.

3. **`VITE_API_URL` without `/api/v1` suffix** — every request 404s. The backend mounts every route under `/api/v1`.

4. **bcrypt native binary in Alpine** — the `pnpm install --frozen-lockfile` step in the Dockerfile rebuilds bcrypt for the Alpine glibc-musl layout. If you ever switch the Dockerfile base image, expect a `Error: Cannot find module 'bcrypt'` on boot until the build runs again.

5. **Drizzle schema drift** — if you add a column to a table the portal touches and forget to mirror it into `backend-portal/src/db/schema/`, the portal's TypeScript types and queries won't know about it. The portal will still run; the new column will just be invisible.

6. **`APP_URL` wrong** — the password-reset emails will link to localhost. Set it to the portal's public URL.
