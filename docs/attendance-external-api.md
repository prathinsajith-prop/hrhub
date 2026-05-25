# Attendance External API

Push punch events into HRHub from a biometric device, time clock, mobile app,
or any third-party system. Each accepted call writes a row to the
`attendance_records` table for the caller's tenant.

> **Endpoint:** `POST /api/v1/attendance/external-punch`
> **Content-Type:** `application/json`
> **Auth:** Connected App key + secret (vendor flow), or HR JWT (testing flow).

The endpoint URL for your tenant is shown in HRHub at
**Attendance → Integrations → External API**.

---

## Authentication

There are two ways to authenticate. **Vendors and devices should always use
Connected Apps**; the JWT path is only for HR engineers exercising the
endpoint manually.

### Connected App key (recommended for all integrations)

1. In HRHub, open **Connected Apps** (sidebar → Workspace → Connected Apps).
2. Click **New app**, name the integration (e.g. *"Reception clock"*), and
   check the **`attendance:write`** scope under the *Attendance* group.
3. Click **Create**. The app key and secret are revealed **exactly once** in
   the *Save your app secret* dialog — copy both immediately.
4. Optional: restrict the app to a device IP / `/24` / `/16` range under
   *IP allowlist*.
5. Provide the vendor with both values:

   ```
   App Key:    app_live_<24 hex chars>
   App Secret: sk_<48 hex chars>
   ```

Then call the endpoint with both headers:

```bash
curl -X POST 'https://api.hrhub.ae/api/v1/attendance/external-punch' \
  -H 'X-App-Key: app_live_661fd6bc6cc3b155dcda7072' \
  -H 'X-API-Secret: sk_25560e78a787d7388f3913b1a5b9fde6d4190022a3cc3b52' \
  -H 'Content-Type: application/json' \
  -d '{
    "employeeId": "<EMPLOYEE_ID>",
    "punchType": "in",
    "source": "biometric"
  }'
```

The secret may also be carried as `Authorization: Bearer sk_…` instead of
the `X-API-Secret` header — the result is identical.

#### Encryption at rest

The plaintext secret is **never persisted**. Only its bcrypt hash
(`secretHash`, cost 12) is written to the `connected_apps` table; the plain
value is returned to the browser in the reveal modal and discarded server-
side. Verification uses `bcrypt.compare` at request time
(`backend/src/modules/attendance/external-auth.ts`).

If a secret leaks, **regenerate it** from the app detail page — every prior
secret becomes invalid the moment the new one is issued.

#### Audit + telemetry

Each successful call bumps `connected_apps.lastUsedAt` and
`connected_apps.requestCount`, visible on the Connected Apps detail page.
Failed verification does **not** consume telemetry. Punches recorded via an
app credential are written with `source = 'biometric' | 'api' | 'mobile'`
(your choice) and tagged with `deviceId` / `deviceName` if supplied.

### HR JWT (manual testing only)

The same access token issued by `POST /api/v1/auth/login` works here. Use it
when smoke-testing the endpoint by hand; do **not** ship a JWT with a
vendor — they expire every 15 minutes and rotating them programmatically
re-creates the credential management problem Connected Apps solves.

```bash
curl -X POST 'http://localhost:4000/api/v1/attendance/external-punch' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{ "employeeId": "<EMPLOYEE_ID>", "punchType": "in" }'
```

JWT callers still respect the role gate:

| Caller role                                 | What they can do                                          |
| ------------------------------------------- | --------------------------------------------------------- |
| `super_admin`, `hr_manager`, `pro_officer`  | Punch for **any** employee in the tenant.                 |
| `dept_head`, `employee`                     | Punch only for `request.user.employeeId` — otherwise `403`. |

App-key callers bypass the per-user gate because they were already authorised
at app-creation time by the HR admin who granted the `attendance:write` scope.

---

## Request body

| Field        | Type                                            | Required | Notes                                                                                  |
| ------------ | ----------------------------------------------- | :------: | -------------------------------------------------------------------------------------- |
| `employeeId` | string (uuid)                                   |   yes    | Must belong to the caller's tenant — cross-tenant attempts return `403`.               |
| `punchType`  | `"in"` &#124; `"out"`                           |   yes    | `out` requires a same-day `in`; otherwise returns `422`.                               |
| `timestamp`  | string (ISO-8601 with timezone)                 |    no    | Defaults to "now" on the server clock. Naïve strings are treated as UTC — emit with a zone offset to avoid drift. |
| `deviceId`   | string                                          |    no    | Free-form device identifier (e.g. door reader serial). Stored on the row.              |
| `deviceName` | string                                          |    no    | Human label written into the row's `notes` (`"Punched via <name>"`).                   |
| `source`     | `"biometric"` &#124; `"api"` &#124; `"mobile"`  |    no    | Stored on the row's `notes` (`"Source: <value>"`) when no `deviceName` is provided.    |

Response on success:

```json
{
  "data": {
    "id": "b086fded-b0c8-4b23-87c0-ae899be80bb6",
    "tenantId": "5fec6a4c-5a66-4e45-8da0-576c6086895e",
    "employeeId": "b25fe5dd-a4e6-4354-8941-7782fabb9f8e",
    "date": "2026-05-22",
    "checkIn": "2026-05-22T12:04:33.441Z",
    "checkOut": null,
    "hoursWorked": null,
    "overtimeHours": "0.00",
    "status": "present",
    "notes": "Source: biometric"
  }
}
```

---

## Resolving a biometric device user ID

Most physical readers emit their own internal user ID (e.g. `EMP-101`), not
the HRHub employee UUID. Map them once in
**Attendance → Integrations → Biometric ID mapping**, then translate at the
edge before posting:

```text
device_user_id  →  GET /api/v1/biometric/mappings?mapperId=EMP-101
                →  employeeId
                →  POST /api/v1/attendance/external-punch
```

For high-volume punch streams the simpler path is the bulk import endpoint
on the same page (CSV / XLSX upload with preview).

---

## Failure modes

| HTTP | Meaning                                                       | Likely fix                                                       |
| :--: | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| 400  | Missing `employeeId` / `punchType`                            | Send both fields.                                                |
| 401  | Invalid app key, wrong secret, or no/invalid JWT              | Check the credentials; regenerate the secret if lost.            |
| 403  | App revoked, scope missing, IP not allowlisted, or cross-tenant employee | Re-grant `attendance:write`, widen allowlist, or fix the `employeeId`. |
| 422  | `punchType=out` with no same-day `in`                         | Send `in` first, or reconcile via Biometric Import.              |

---

## Where the code lives

| Concern                  | File                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Route + dual-auth        | `backend/src/modules/attendance/attendance.routes.ts` (`POST /attendance/external-punch`) |
| App-key preHandler       | `backend/src/modules/attendance/external-auth.ts`                                     |
| Service                  | `backend/src/modules/attendance/attendance.service.ts` (`externalPunch()`)            |
| Connected Apps issuance  | `backend/src/modules/apps/apps.{routes,service}.ts`, `frontend/src/pages/organizations/ConnectedAppsPage.tsx` |
| Frontend discovery       | `frontend/src/pages/attendance/BiometricImportPage.tsx` (**External API** tab)        |
| Biometric mappings       | `backend/src/modules/attendance/biometric.{routes,service}.ts`                        |
| Tests                    | `backend/src/__tests__/attendance-external-auth.test.ts`                              |
