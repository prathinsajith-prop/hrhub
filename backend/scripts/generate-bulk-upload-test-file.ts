/// <reference types="node" />
/**
 * Generate a real .xlsx file that can be uploaded into the bulk Payroll
 * Adjustments dialog for the Herman Carver Plc tenant.
 *
 *   pnpm exec tsx scripts/generate-bulk-upload-test-file.ts
 *
 * Produces:
 *   test-data/herman-carver-plc-bulk-upload.xlsx     (mostly-valid happy path)
 *   test-data/herman-carver-plc-bulk-edge-cases.xlsx (every error path)
 *
 * The valid file pulls 8 real Herman Carver employees and exercises all
 * three resolution paths (employee_no, email, phone). The edge-case file
 * adds bad rows on top so HR can see how the dialog renders each error.
 */
import { and, eq, inArray } from 'drizzle-orm'
import * as XLSX from 'xlsx'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { db } from '../src/db/index.js'
import { employees, tenants } from '../src/db/schema/index.js'

const TENANT_NAME = 'Herman Carver Plc'

interface Row {
    employee_no: string
    employee_name: string
    employee_email: string
    employee_phone: string
    amount: number | string
    note: string
}

function buildSheet(rows: Row[]) {
    const aoa: unknown[][] = [
        ['employee_no', 'employee_name', 'employee_email', 'employee_phone', 'amount', 'note'],
    ]
    for (const r of rows) {
        aoa.push([r.employee_no, r.employee_name, r.employee_email, r.employee_phone, r.amount, r.note])
    }
    const sheet = XLSX.utils.aoa_to_sheet(aoa)
    sheet['!cols'] = [{ wch: 14 }, { wch: 26 }, { wch: 32 }, { wch: 18 }, { wch: 10 }, { wch: 36 }]
    return sheet
}

function writeWorkbook(filePath: string, sheet: XLSX.WorkSheet, sheetName = 'Adjustments') {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, sheetName)
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    return writeFile(filePath, buf)
}

async function main() {
    console.log(`\n═══ Generating Herman Carver Plc bulk-upload test files ═══\n`)

    // Find the tenant — fall back to the seed tenant if Herman Carver doesn't
    // exist yet, so this script remains runnable on a fresh DB.
    const [tenant] = await db
        .select({ id: tenants.id, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.name, TENANT_NAME))
        .limit(1)

    if (!tenant) {
        console.error(`✗ Tenant "${TENANT_NAME}" not found. Run pnpm db:seed first or update TENANT_NAME.`)
        process.exit(1)
    }
    console.log(`✓ Tenant found: ${tenant.name} (${tenant.id})`)

    // Pull active, non-archived employees with at least an employee_no or email.
    const emps = await db
        .select({
            id: employees.id,
            employeeNo: employees.employeeNo,
            firstName: employees.firstName,
            lastName: employees.lastName,
            email: employees.email,
            workEmail: employees.workEmail,
            mobileNo: employees.mobileNo,
            phone: employees.phone,
        })
        .from(employees)
        .where(and(
            eq(employees.tenantId, tenant.id),
            eq(employees.isArchived, false),
            inArray(employees.status, ['active', 'onboarding']),
        ))
        .limit(20)

    if (emps.length < 3) {
        console.error(`✗ Only ${emps.length} active employees in ${TENANT_NAME}. Need ≥3 to build a representative test.`)
        process.exit(1)
    }
    console.log(`✓ Loaded ${emps.length} active employees`)

    // Prefer employees with all three identifiers populated so every row
    // in the file has authoritative data to match against. Fall back to
    // partials only if the well-equipped pool is too small.
    const wellEquipped = emps.filter((e) =>
        e.employeeNo && (e.workEmail || e.email) && (e.mobileNo || e.phone),
    )
    const pool = wellEquipped.length >= 4 ? wellEquipped : emps
    if (wellEquipped.length < 4) {
        console.log(`  ⚠ only ${wellEquipped.length} employees have employee_no + email + phone — using broader pool`)
    } else {
        console.log(`  ✓ ${wellEquipped.length} employees have all three identifiers — using well-equipped pool`)
    }
    const sample = pool.slice(0, Math.min(8, pool.length))

    // ── Happy path file ─────────────────────────────────────────────────────
    // Mix of: full identifier, employee_no only, email only, phone only.
    const happyRows: Row[] = sample.map((e, idx) => {
        const name = `${e.firstName} ${e.lastName}`.trim()
        const emailVal = e.workEmail ?? e.email ?? ''
        const phoneVal = e.mobileNo ?? e.phone ?? ''
        // Cycle through resolution strategies: 0=all-fields, 1=no-only,
        // 2=email-only, 3=phone-only (when available).
        const strategy = idx % 4
        const hasPhone = phoneVal !== ''
        return {
            employee_no: (strategy === 1 || strategy === 0) ? (e.employeeNo ?? '') : '',
            employee_name: name,
            employee_email: (strategy === 2 || strategy === 0) ? emailVal : '',
            employee_phone: ((strategy === 3 && hasPhone) || strategy === 0) ? phoneVal : '',
            amount: 100 + idx * 50, // 100, 150, 200, …
            note: strategy === 1 ? 'Resolve by employee_no'
                : strategy === 2 ? 'Resolve by email'
                    : strategy === 3 ? 'Resolve by phone'
                        : 'All identifiers present',
        }
    })

    // ── Edge-case file ──────────────────────────────────────────────────────
    // Same happy rows + intentional errors + a duplicate to exercise the
    // duplicate-employee warning.
    const e1 = sample[0]
    const e2 = sample[1]
    const edgeRows: Row[] = [
        ...happyRows,
        // Duplicate employee (warning, not blocker)
        {
            employee_no: e1.employeeNo ?? '',
            employee_name: `${e1.firstName} ${e1.lastName}`,
            employee_email: '',
            employee_phone: '',
            amount: 50,
            note: 'DUPLICATE — second adjustment for the same employee',
        },
        // Bad: amount = 0
        {
            employee_no: e2.employeeNo ?? '',
            employee_name: `${e2.firstName} ${e2.lastName}`,
            employee_email: '',
            employee_phone: '',
            amount: 0,
            note: 'INVALID — amount is zero',
        },
        // Bad: negative amount
        {
            employee_no: e2.employeeNo ?? '',
            employee_name: `${e2.firstName} ${e2.lastName}`,
            employee_email: '',
            employee_phone: '',
            amount: -250,
            note: 'INVALID — negative amount',
        },
        // Bad: amount is not numeric
        {
            employee_no: e2.employeeNo ?? '',
            employee_name: `${e2.firstName} ${e2.lastName}`,
            employee_email: '',
            employee_phone: '',
            amount: 'one hundred' as unknown as number,
            note: 'INVALID — non-numeric amount',
        },
        // Bad: unknown employee_no
        {
            employee_no: 'EMP-DOES-NOT-EXIST',
            employee_name: 'Ghost Employee',
            employee_email: '',
            employee_phone: '',
            amount: 500,
            note: 'INVALID — unknown employee_no',
        },
        // Bad: unknown email
        {
            employee_no: '',
            employee_name: 'No Match',
            employee_email: 'unknown.person@example.com',
            employee_phone: '',
            amount: 500,
            note: 'INVALID — unknown email',
        },
        // Bad: every identifier blank
        {
            employee_no: '',
            employee_name: 'Just A Name',
            employee_email: '',
            employee_phone: '',
            amount: 500,
            note: 'INVALID — no identifier provided',
        },
        // Bad: cross-tenant employee_no (looks valid but won't exist in this
        // tenant — the bulk endpoint filters by tenant so cross-tenant IDs
        // are silently treated as not-found, which is the correct behaviour).
        {
            employee_no: 'CROSS-TENANT-001',
            employee_name: 'Phantom From Another Org',
            employee_email: '',
            employee_phone: '',
            amount: 999,
            note: 'INVALID — employee_no from a different tenant',
        },
    ]

    // process.cwd() when run with `pnpm exec tsx scripts/...` is the backend
    // workspace. Walk up one level so the file ends up in the repo's test-data/.
    const outDir = resolve(process.cwd(), '..', 'test-data')
    await mkdir(outDir, { recursive: true })

    const happyPath = join(outDir, 'herman-carver-plc-bulk-upload.xlsx')
    await writeWorkbook(happyPath, buildSheet(happyRows))
    console.log(`✓ Wrote ${happyPath}`)
    console.log(`  Rows: ${happyRows.length} (all valid — happy-path import)`)

    const edgePath = join(outDir, 'herman-carver-plc-bulk-edge-cases.xlsx')
    await writeWorkbook(edgePath, buildSheet(edgeRows))
    console.log(`✓ Wrote ${edgePath}`)
    console.log(`  Rows: ${edgeRows.length} (${happyRows.length} valid + 1 dup-warning + 7 error rows)`)

    console.log('\nUsage:')
    console.log(`  1. Log in to HRHub as a user in the "${TENANT_NAME}" tenant`)
    console.log('  2. Open Payroll → Adjustments → Add adjustment → Bulk import tab')
    console.log('  3. Pick a category, then drop one of the generated files')
    console.log('  4. Validation will surface row-by-row results before commit\n')

    process.exit(0)
}

main().catch((err) => {
    console.error('✗ Failed:', err)
    process.exit(1)
})
