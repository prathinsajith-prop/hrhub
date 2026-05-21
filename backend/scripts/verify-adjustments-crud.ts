/**
 * Full CRUD smoke-test for the payroll adjustments API. Exercises every
 * endpoint: list, single create / update / delete, validate, bulk create,
 * imports list, template downloads. Talks to the locally-running backend
 * at http://localhost:4000.
 *
 *   pnpm exec tsx scripts/verify-adjustments-crud.ts
 *
 * Read-only against payroll_runs (we never leave draft state); inserts +
 * deletes only manual adjustments for a future period so live data is
 * untouched.
 */

const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1'
// Use a far-future period so we never collide with real payroll runs.
const PERIOD_YEAR = 2099
const PERIOD_MONTH = 12

let failures = 0
const start = Date.now()

function ok(label: string, detail = ''): void {
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`)
}
function bad(label: string, detail = ''): void {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failures++
}
function section(title: string): void {
    console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 68 - title.length))}`)
}

async function login(email: string, password: string): Promise<string | null> {
    const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    })
    if (res.status !== 200) return null
    const body = await res.json() as { accessToken?: string; data?: { accessToken?: string } }
    return body.accessToken ?? body.data?.accessToken ?? null
}

async function main(): Promise<void> {
    section('Auth')
    // Try common dev credentials in turn.
    const credCandidates: Array<[string, string]> = [
        ['admin@hrhub.ae', 'Admin@12345'],
        ['superadmin@hrhub.ae', 'Admin@12345'],
    ]
    let token: string | null = null
    let loggedInAs = ''
    for (const [email, pw] of credCandidates) {
        token = await login(email, pw)
        if (token) { loggedInAs = email; break }
    }
    if (!token) {
        bad('login (no seeded credentials matched)')
        process.exit(1)
    }
    ok(`logged in as ${loggedInAs}`)

    const auth = { Authorization: `Bearer ${token}` }
    const jsonHeaders = { ...auth, 'Content-Type': 'application/json' }
    const period = `?year=${PERIOD_YEAR}&month=${PERIOD_MONTH}`

    // ── 1. List adjustments (initial state) ─────────────────────────────────
    section('GET /payroll/adjustments (list)')
    const initial = await fetch(`${BASE}/payroll/adjustments${period}`, { headers: auth })
    const initialBody = await initial.json() as { data: Array<{ id: string; source: string }>; locked: boolean }
    if (initial.status === 200) ok('list (200)', `${initialBody.data.length} rows, locked=${initialBody.locked}`)
    else bad('list (200)', `status ${initial.status}`)
    const initialIds = new Set(initialBody.data.map((r) => r.id))

    // Locate a real employee in the caller's tenant so the inserts resolve.
    section('Pick an employee for the test (via employees list)')
    const empRes = await fetch(`${BASE}/employees?limit=1&status=active`, { headers: auth })
    const empBody = await empRes.json() as { data: Array<{ id: string; employeeNo: string; firstName: string; lastName: string }> }
    const testEmp = empBody.data?.[0]
    if (!testEmp) {
        bad('found a test employee (no active employees in this tenant)')
        process.exit(1)
    }
    ok(`using ${testEmp.firstName} ${testEmp.lastName} (${testEmp.employeeNo}) id=${testEmp.id}`)

    // ── 2. INSERT — single ──────────────────────────────────────────────────
    section('POST /payroll/adjustments (single insert)')
    const createRes = await fetch(`${BASE}/payroll/adjustments`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({
            employeeId: testEmp.id,
            periodYear: PERIOD_YEAR, periodMonth: PERIOD_MONTH,
            category: 'overtime', amount: 123.45, notes: 'CRUD smoke-test row',
        }),
    })
    if (createRes.status === 201) ok('create (201)')
    else {
        const body = await createRes.text()
        bad('create (201)', `status ${createRes.status} body=${body}`)
        process.exit(1)
    }
    const createBody = await createRes.json() as { data: { id: string; amount: string; kind: string; category: string } }
    const newId = createBody.data.id
    ok(`returned row id=${newId}`, `amount=${createBody.data.amount}, kind=${createBody.data.kind}, category=${createBody.data.category}`)
    if (createBody.data.kind !== 'addition') bad(`overtime should classify as 'addition'`, `got '${createBody.data.kind}'`)

    // Cross-tenant guard — try to insert with a UUID that doesn't belong to the tenant.
    const xtRes = await fetch(`${BASE}/payroll/adjustments`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({
            employeeId: '00000000-0000-0000-0000-000000000000',
            periodYear: PERIOD_YEAR, periodMonth: PERIOD_MONTH,
            category: 'manual', amount: 100,
        }),
    })
    if (xtRes.status === 404) ok('cross-tenant employee rejected (404)')
    else bad('cross-tenant employee rejected (404)', `got ${xtRes.status}`)

    // Bad amount
    const badAmtRes = await fetch(`${BASE}/payroll/adjustments`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({
            employeeId: testEmp.id, periodYear: PERIOD_YEAR, periodMonth: PERIOD_MONTH,
            category: 'manual', amount: -1,
        }),
    })
    if (badAmtRes.status === 400) ok('negative amount rejected (400)')
    else bad('negative amount rejected (400)', `got ${badAmtRes.status}`)

    // ── 3. PATCH — update ───────────────────────────────────────────────────
    section(`PATCH /payroll/adjustments/${newId}`)
    const patchRes = await fetch(`${BASE}/payroll/adjustments/${newId}`, {
        method: 'PATCH', headers: jsonHeaders,
        body: JSON.stringify({ amount: 250, notes: 'patched-by-crud-test', category: 'bonus' }),
    })
    if (patchRes.status === 200) ok('patch (200)')
    else bad('patch (200)', `status ${patchRes.status}`)
    const patchBody = await patchRes.json() as { data: { amount: string; notes: string; category: string; kind: string } }
    if (Number(patchBody.data.amount) === 250) ok('amount updated to 250')
    else bad('amount updated to 250', `got ${patchBody.data.amount}`)
    if (patchBody.data.notes === 'patched-by-crud-test') ok('notes updated')
    else bad('notes updated', `got ${patchBody.data.notes}`)
    if (patchBody.data.category === 'bonus' && patchBody.data.kind === 'addition') ok('category swap also flipped kind')
    else bad('category swap flipped kind', `category=${patchBody.data.category}, kind=${patchBody.data.kind}`)

    // Patch a non-existent id → 404
    const notFoundPatch = await fetch(`${BASE}/payroll/adjustments/00000000-0000-0000-0000-000000000000`, {
        method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ amount: 1 }),
    })
    if (notFoundPatch.status === 404) ok('patch unknown id → 404')
    else bad('patch unknown id → 404', `got ${notFoundPatch.status}`)

    // ── 4. VALIDATE — preview ───────────────────────────────────────────────
    section('POST /payroll/adjustments/bulk-validate')
    const v = await fetch(`${BASE}/payroll/adjustments/bulk-validate`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({
            periodYear: PERIOD_YEAR, periodMonth: PERIOD_MONTH,
            rows: [
                { rowNumber: 2, employeeNo: testEmp.employeeNo, amount: 100, notes: 'by employee_no' },
                { rowNumber: 3, employeeNo: 'NONEXISTENT-EMP', amount: 50 },
                { rowNumber: 4, employeeNo: testEmp.employeeNo, amount: 0 },
                { rowNumber: 5, employeeNo: testEmp.employeeNo, amount: -10 },
                { rowNumber: 6, amount: 999 }, // no identifier
                { rowNumber: 7, employeeNo: testEmp.employeeNo, amount: 50 },
                { rowNumber: 8, employeeNo: testEmp.employeeNo, amount: 50 }, // dup
            ],
        }),
    })
    if (v.status !== 200) bad('validate (200)', `status ${v.status}`)
    else {
        const vBody = await v.json() as { total: number; valid: number; invalid: number; warned: number; rows: Array<{ rowNumber: number; status: string; error: string | null; warning: string | null; resolvedName: string | null }> }
        ok(`total=${vBody.total} valid=${vBody.valid} invalid=${vBody.invalid} warned=${vBody.warned}`)
        const r2 = vBody.rows.find((r) => r.rowNumber === 2)
        const r3 = vBody.rows.find((r) => r.rowNumber === 3)
        const r4 = vBody.rows.find((r) => r.rowNumber === 4)
        const r6 = vBody.rows.find((r) => r.rowNumber === 6)
        const r7 = vBody.rows.find((r) => r.rowNumber === 7)
        if (r2?.status === 'valid' && r2.resolvedName) ok('row 2 resolved by employee_no', r2.resolvedName)
        else bad('row 2 resolved by employee_no', JSON.stringify(r2))
        if (r3?.status === 'invalid' && /not found/.test(r3.error ?? '')) ok('row 3 invalid (not found)')
        else bad('row 3 invalid (not found)', JSON.stringify(r3))
        if (r4?.status === 'invalid' && /positive/.test(r4.error ?? '')) ok('row 4 invalid (zero)')
        else bad('row 4 invalid (zero)', JSON.stringify(r4))
        if (r6?.status === 'invalid' && /not found/.test(r6.error ?? '')) ok('row 6 invalid (no identifier)')
        else bad('row 6 invalid (no identifier)', JSON.stringify(r6))
        if (r7?.warning && /more than once|appears/.test(r7.warning)) ok('row 7 has dup-warning')
        else bad('row 7 has dup-warning', JSON.stringify(r7))
    }

    // ── 5. BULK — JSON path ─────────────────────────────────────────────────
    section('POST /payroll/adjustments/bulk (JSON, no file)')
    const bulkRes = await fetch(`${BASE}/payroll/adjustments/bulk`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({
            periodYear: PERIOD_YEAR, periodMonth: PERIOD_MONTH, category: 'overtime',
            rows: [
                { rowNumber: 2, employeeNo: testEmp.employeeNo, amount: 33, notes: 'bulk-test-A' },
                { rowNumber: 3, employeeNo: testEmp.employeeNo, amount: 77, notes: 'bulk-test-B' },
            ],
        }),
    })
    if (bulkRes.status === 201) {
        const b = await bulkRes.json() as { created: number; failed: number }
        ok(`bulk insert (201)`, `created=${b.created}, failed=${b.failed}`)
    } else {
        const t = await bulkRes.text()
        bad('bulk insert (201)', `status ${bulkRes.status} body=${t}`)
    }

    // ── 6. TEMPLATE downloads ───────────────────────────────────────────────
    section('GET /payroll/adjustments/bulk-template')
    const tplBlank = await fetch(`${BASE}/payroll/adjustments/bulk-template`, { headers: auth })
    const tplBlankBuf = await tplBlank.arrayBuffer()
    if (tplBlank.status === 200 && tplBlankBuf.byteLength > 1000) ok('blank template', `${tplBlankBuf.byteLength} bytes`)
    else bad('blank template', `status=${tplBlank.status} size=${tplBlankBuf.byteLength}`)
    const tplSample = await fetch(`${BASE}/payroll/adjustments/bulk-template?withSample=true`, { headers: auth })
    const tplSampleBuf = await tplSample.arrayBuffer()
    if (tplSample.status === 200 && tplSampleBuf.byteLength > tplBlankBuf.byteLength) ok('sample template (larger than blank)', `${tplSampleBuf.byteLength} bytes`)
    else bad('sample template', `status=${tplSample.status} size=${tplSampleBuf.byteLength}`)

    // ── 7. IMPORTS list ─────────────────────────────────────────────────────
    section('GET /payroll/adjustments/imports')
    const list = await fetch(`${BASE}/payroll/adjustments/imports`, { headers: auth })
    const listBody = await list.json() as { data?: unknown[] }
    if (list.status === 200 && Array.isArray(listBody.data)) ok('imports list (200, array)', `${listBody.data.length} rows`)
    else bad('imports list (200, array)', `status=${list.status} body=${JSON.stringify(listBody).slice(0, 200)}`)

    // ── 8. DELETE — clean up everything we just inserted ────────────────────
    section('DELETE /payroll/adjustments/:id (cleanup)')
    const afterCreate = await fetch(`${BASE}/payroll/adjustments${period}`, { headers: auth })
    const afterCreateBody = await afterCreate.json() as { data: Array<{ id: string; source: string }> }
    const toDelete = afterCreateBody.data.filter((r) => !initialIds.has(r.id) && r.source === 'manual').map((r) => r.id)
    ok(`identified ${toDelete.length} rows to delete`)
    for (const id of toDelete) {
        const del = await fetch(`${BASE}/payroll/adjustments/${id}`, { method: 'DELETE', headers: auth })
        if (del.status === 204) ok(`delete ${id.slice(0, 8)}… (204)`)
        else bad(`delete ${id.slice(0, 8)}…`, `status ${del.status}`)
    }

    // Verify the period is back to its original state.
    const final = await fetch(`${BASE}/payroll/adjustments${period}`, { headers: auth })
    const finalBody = await final.json() as { data: Array<{ id: string }> }
    if (finalBody.data.length === initialBody.data.length) ok('row count restored to initial state')
    else bad('row count restored', `initial=${initialBody.data.length} final=${finalBody.data.length}`)

    // ── Summary ─────────────────────────────────────────────────────────────
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.log('\n' + '═'.repeat(72))
    if (failures === 0) {
        console.log(`✓ All adjustment CRUD checks passed (${elapsed}s)`)
        process.exit(0)
    } else {
        console.log(`✗ ${failures} check(s) failed (${elapsed}s)`)
        process.exit(1)
    }
}

main().catch((err) => {
    console.error('\n✗ Fatal error:', err)
    process.exit(1)
})
