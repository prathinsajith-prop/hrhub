# Attendance External API

Push punch events into HRHub from a biometric device, time-clock, mobile app,
or any third-party system. Each accepted call writes a row to the
`attendance_records` table for the caller's tenant.

> **Endpoint:** `POST /api/v1/attendance/external-punch`
> **Auth:** `Authorization: Bearer <ACCESS_TOKEN>`
> **Content-Type:** `application/json`

Find the live URL inside HRHub at **Attendance → Integrations → External API**.
The tab shows the resolved endpoint for the current environment plus a
copy-paste cURL example.

---

## Smoke-test results (2026-05-22)

Run against `http://localhost:4000` with the seeded super-admin account
(`admin@hrhub.ae` / `Admin@12345`). All four cases pass.

| Case                 | Method | Body                                                                                    | Result |
| -------------------- | ------ | --------------------------------------------------------------------------------------- | :----: |
| Valid check-in       | POST   | `{ "employeeId": "<uuid>", "punchType": "in", "source": "biometric" }`                  | `200`  |
| Valid check-out      | POST   | `{ "employeeId": "<uuid>", "punchType": "out", "source": "biometric" }`                 | `200`  |
| Missing `employeeId` | POST   | `{ "punchType": "in" }`                                                                 | `400`  |
| Unknown employee     | POST   | `{ "employeeId": "00000000-0000-0000-0000-000000000000", "punchType": "in" }`           | `403`  |
| No bearer token      | POST   | (valid body)                                                                            | `401`  |

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

## Request body

| Field        | Type                            | Required | Notes                                                                                  |
| ------------ | ------------------------------- | :------: | -------------------------------------------------------------------------------------- |
| `employeeId` | string (uuid)                   |   yes    | Must belong to the caller's tenant — cross-tenant attempts return `403`.               |
| `punchType`  | `"in"` &#124; `"out"`           |   yes    | `out` requires a same-day `in`; otherwise returns `422`.                               |
| `timestamp`  | string (ISO-8601 with timezone) |    no    | Defaults to "now" on the server clock. Naïve strings are treated as UTC — emit with a zone offset to avoid drift. |
| `deviceId`   | string                          |    no    | Free-form device identifier (e.g. door reader serial). Stored on the row.              |
| `deviceName` | string                          |    no    | Human label written into the row's `notes` (`"Punched via <name>"`).                   |
| `source`     | `"biometric"` &#124; `"api"` &#124; `"mobile"` | no | Stored on the row's `notes` (`"Source: <value>"`) when no `deviceName` is provided.    |

---

## Authentication

The endpoint is mounted with the standard JWT preHandler, so the same access
token used by the SPA works here. For unattended integrations, create a
service-account user in the customer's tenant and use its tokens:

1. Sign in as the service account: `POST /api/v1/auth/login` →
   `{ "email": "...", "password": "..." }` returns `accessToken` + `refreshToken`.
2. Refresh before expiry (15 minutes by default): `POST /api/v1/auth/refresh` →
   `{ "refreshToken": "..." }`.

Tokens are tenant-scoped — every query is filtered server-side by the
`tenantId` claim, so a leaked token cannot reach another customer's data.

### Role gating

| Caller role                                 | What they can do                                          |
| ------------------------------------------- | --------------------------------------------------------- |
| `super_admin`, `hr_manager`, `pro_officer`  | Punch for **any** employee in the tenant.                 |
| `dept_head`, `employee`                     | Punch only for `request.user.employeeId` — otherwise `403`. |

---

## Example — cURL

Replace `<ACCESS_TOKEN>` and `<EMPLOYEE_ID>`:

```bash
curl -X POST 'http://localhost:4000/api/v1/attendance/external-punch' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{
    "employeeId": "<EMPLOYEE_ID>",
    "punchType": "in",
    "timestamp": "2026-05-22T08:30:00.000Z",
    "deviceId": "lobby-reader-01",
    "source": "biometric"
  }'
```

Production base URL: whatever `VITE_API_URL` points to in the customer's
deployment (the **External API** tab in the UI shows the resolved value).

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

For high-volume punch streams the simpler path is the bulk
import endpoint on the same page (CSV / XLSX upload with preview).

---

## Failure modes

| HTTP | Meaning                                              | Likely fix                                                       |
| :--: | ---------------------------------------------------- | ---------------------------------------------------------------- |
| 400  | Missing `employeeId` / `punchType`                   | Send both fields.                                                |
| 401  | No / invalid / expired bearer token                  | Refresh and retry.                                               |
| 403  | Employee not in caller's tenant, or role-scoped out  | Verify the mapping; use a service account for cross-employee punches. |
| 422  | `punchType=out` with no same-day `in`                | Send `in` first, or reconcile via Biometric Import.              |

---

## Where the code lives

| Concern             | File                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| Route + auth        | `backend/src/modules/attendance/attendance.routes.ts` (`POST /attendance/external-punch`) |
| Service             | `backend/src/modules/attendance/attendance.service.ts` (`externalPunch()`)    |
| Frontend discovery  | `frontend/src/pages/attendance/BiometricImportPage.tsx` (**External API** tab) |
| Biometric mappings  | `backend/src/modules/attendance/biometric.{routes,service}.ts`                |
