/**
 * End-to-end verification: exercise the full payroll flow against the live
 * DB for the Herman Carver Plc tenant and confirm every step produces the
 * numbers we expect. Read-only — no payroll runs are persisted.
 *
 *   pnpm exec tsx scripts/verify-payroll-flow.ts
 */
import { listPayrollRuns, getPayrollRun, getPayslipsWithEmployees, previewPayrollRun, getPayrollReadiness } from '../src/modules/payroll/payroll.service.js'
import { listAdjustments, getAdjustmentTotalsByEmployee } from '../src/modules/payroll/adjustments.service.js'

const TENANT_ID = '88dbd3d5-8c7c-435b-b85e-5489ab60e47a' // Herman Carver Plc

function pass(msg: string) { console.log(`  ✓ ${msg}`) }
function fail(msg: string): never { console.error(`  ✗ ${msg}`); process.exit(1) }

async function main() {
    console.log('\n═══ Payroll end-to-end verification ═══\n')

    // ── 1. listPayrollRuns (the dashboard call) ──────────────────────────
    const list = await listPayrollRuns(TENANT_ID, { limit: 12, offset: 0 })
    console.log(`1. listPayrollRuns: ${list.data.length} runs (total ${list.total})`)
    if (list.data.length === 0) fail('no payroll runs found for the test tenant')

    const draftRow = list.data.find(r => r.status === 'draft')
    if (!draftRow) {
        console.log('   ⚠ no draft run — skipping draft-only checks')
    } else {
        // 2. Draft preview totals must be non-zero (we have payable employees)
        const tn = Number(draftRow.totalNet)
        if (!Number.isFinite(tn) || tn <= 0) fail(`draft totalNet should be > 0, got ${draftRow.totalNet}`)
        pass(`draft ${draftRow.month}/${draftRow.year} preview totalNet = ${draftRow.totalNet}`)

        // 3. getPayrollRun (the pending-run hero card) returns the same preview
        const single = await getPayrollRun(TENANT_ID, draftRow.id) as any
        if (single?.totalNet !== draftRow.totalNet) {
            fail(`getPayrollRun totals diverged from listPayrollRuns: ${single?.totalNet} vs ${draftRow.totalNet}`)
        }
        pass('getPayrollRun preview agrees with listPayrollRuns')

        // 4. previewPayrollRun returns the same number (called directly)
        const direct = await previewPayrollRun(TENANT_ID, draftRow.id)
        if (!direct) fail('previewPayrollRun returned null for a draft')
        if (Math.round(direct.totalNet * 100) !== Math.round(Number(draftRow.totalNet) * 100)) {
            fail(`previewPayrollRun direct ${direct.totalNet} vs list ${draftRow.totalNet}`)
        }
        pass(`previewPayrollRun direct totalNet = ${direct.totalNet.toFixed(2)} (${direct.totalEmployees} employees)`)

        // 5. getPayslipsWithEmployees returns the same per-employee values
        const slips = await getPayslipsWithEmployees(TENANT_ID, draftRow.id)
        const sumOfSlips = slips.reduce((s, p: any) => s + Number(p.netSalary), 0)
        if (Math.round(sumOfSlips * 100) !== Math.round(direct.totalNet * 100)) {
            fail(`sum of payslip nets ${sumOfSlips.toFixed(2)} != totalNet ${direct.totalNet.toFixed(2)}`)
        }
        pass(`getPayslipsWithEmployees: ${slips.length} draft payslips, sum = ${sumOfSlips.toFixed(2)}`)
        const allDrafts = slips.every((p: any) => p.isDraft === true)
        if (!allDrafts) fail('expected every preview row to carry isDraft=true')
        pass('all draft preview rows have isDraft=true (download UI gated correctly)')

        // 6. Readiness checklist
        const readiness = await getPayrollReadiness(TENANT_ID, draftRow.id)
        if (!readiness) fail('readiness returned null for a draft')
        console.log(`   readiness: ${readiness.employeeCount} employees, blockers=${readiness.blockers.length}, warnings=${readiness.warnings.length}, canProcess=${readiness.canProcess}`)
        pass('readiness checklist responds correctly')

        // 7. Adjustments query (used by the Adjustments tab)
        const adj = await listAdjustments(TENANT_ID, draftRow.year, draftRow.month)
        const totals = await getAdjustmentTotalsByEmployee(TENANT_ID, draftRow.year, draftRow.month)
        pass(`adjustments: ${adj.length} rows, totals computed for ${totals.size} employees`)
    }

    // ── 8. A non-draft run still works (no preview, returns persisted) ───
    const nonDraft = list.data.find(r => r.status !== 'draft')
    if (nonDraft) {
        const single = await getPayrollRun(TENANT_ID, nonDraft.id) as any
        if (single?.totalNet !== nonDraft.totalNet) fail('non-draft getPayrollRun should return persisted totals unchanged')
        pass(`non-draft ${nonDraft.status} run reads persisted totals (${nonDraft.totalNet})`)
    } else {
        console.log('   (no processed runs to check non-draft path — fine)')
    }

    console.log('\n✓ All payroll-flow checks passed\n')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
