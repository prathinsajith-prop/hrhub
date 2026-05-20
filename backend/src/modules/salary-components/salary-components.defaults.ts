/**
 * Default salary components seeded for each new tenant.
 *
 * Picked to give a UAE-typical company a usable catalog on day one:
 *   - Basic + the three standard allowances (housing/transport/cost-of-living)
 *     covering 95% of payslip earnings line items.
 *   - Withheld salary, salary advance, fines/damages, notice pay — the four
 *     deduction kinds visible in the Zoho reference UI.
 *   - Medical insurance — every UAE employer is mandated to provide this.
 *   - The four common corrections (bonus, commission, leave encashment,
 *     annual leave salary).
 *
 * `Basic` is marked `is_system = true` so HR can't delete it — payroll math
 * depends on it for percentage-based earnings ("25% of basic"). All other
 * defaults are inactive by default; HR flips them on as the tenant adopts
 * them, so the table doesn't fire off WPS contributions for a scheme the
 * tenant isn't actually enrolled in.
 */
import type { InferInsertModel } from 'drizzle-orm'
import { salaryComponents } from '../../db/schema/salary_components.js'

type Row = InferInsertModel<typeof salaryComponents>

export function buildDefaultSalaryComponentRows(tenantId: string): Row[] {
    return [
        // ── Earnings ─────────────────────────────────────────────────────
        {
            tenantId, kind: 'earning', category: 'basic',
            name: 'Basic', nameInPayslip: 'Basic',
            payType: 'fixed', calculationType: 'flat',
            applicableSocialSecurity: ['GPSSA', 'ADPF', 'SIO', 'SPF', 'PIFSS'],
            proRata: true, isActive: true, isSystem: true,
        },
        {
            tenantId, kind: 'earning', category: 'housing',
            name: 'Housing Allowance', nameInPayslip: 'Housing Allowance',
            // Flat AED rather than `percentage_of_basic` so per-employee
            // assignments carry their actual housing amount. HR can switch
            // the catalog to percentage from the UI if they prefer.
            payType: 'fixed', calculationType: 'flat',
            applicableSocialSecurity: ['GPSSA', 'ADPF', 'SIO', 'SPF', 'PIFSS'],
            proRata: true, isActive: true, isSystem: false,
        },
        {
            tenantId, kind: 'earning', category: 'transport',
            name: 'Transport Allowance', nameInPayslip: 'Transport Allowance',
            payType: 'fixed', calculationType: 'flat',
            applicableSocialSecurity: ['GPSSA', 'ADPF', 'SIO', 'SPF', 'PIFSS'],
            proRata: true, isActive: true, isSystem: false,
        },
        {
            tenantId, kind: 'earning', category: 'cost_of_living',
            name: 'Cost of Living Allowance', nameInPayslip: 'Cost of Living',
            payType: 'fixed', calculationType: 'flat',
            applicableSocialSecurity: ['GPSSA', 'ADPF', 'SIO', 'SPF', 'PIFSS'],
            proRata: true, isActive: false, isSystem: false,
        },
        {
            // Catch-all bucket — anything HR pays beyond the named allowances
            // (eg. one-off relocation top-up, role-specific premium). Also the
            // landing target for the legacy `employees.other_allowances` field.
            tenantId, kind: 'earning', category: 'custom_allowance',
            name: 'Other Allowance', nameInPayslip: 'Other Allowance',
            payType: 'fixed', calculationType: 'flat',
            applicableSocialSecurity: ['GPSSA', 'ADPF', 'SIO', 'SPF', 'PIFSS'],
            proRata: true, isActive: true, isSystem: false,
        },

        // ── Deductions ───────────────────────────────────────────────────
        {
            tenantId, kind: 'deduction', category: 'withheld_salary',
            name: 'Withheld Salary', nameInPayslip: 'Withheld Salary',
            frequency: 'one_time', isActive: true, isSystem: false,
        },
        {
            tenantId, kind: 'deduction', category: 'salary_advance',
            name: 'Salary Advance', nameInPayslip: 'Salary Advance',
            frequency: 'one_time', isActive: true, isSystem: false,
        },
        {
            tenantId, kind: 'deduction', category: 'fines_damages',
            name: 'Fines and Damages', nameInPayslip: 'Fines and Damages',
            frequency: 'one_time', isActive: true, isSystem: false,
        },
        {
            tenantId, kind: 'deduction', category: 'notice_pay',
            name: 'Notice Pay Deduction', nameInPayslip: 'Notice Pay Deduction',
            frequency: 'one_time', isActive: true, isSystem: false,
        },

        // ── Benefits ─────────────────────────────────────────────────────
        {
            tenantId, kind: 'benefit', category: 'medical_insurance',
            name: 'Medical Insurance', nameInPayslip: 'Medical Insurance',
            frequency: 'recurring', isActive: true, isSystem: false,
        },

        // ── Corrections ──────────────────────────────────────────────────
        // Inactive by default — HR turns them on when a one-off bonus or
        // commission needs to be issued.
        {
            tenantId, kind: 'correction', category: 'bonus',
            name: 'Bonus', nameInPayslip: 'Bonus',
            isActive: false, isSystem: false,
        },
        {
            tenantId, kind: 'correction', category: 'commission',
            name: 'Commission', nameInPayslip: 'Commission',
            isActive: false, isSystem: false,
        },
        {
            tenantId, kind: 'correction', category: 'leave_encashment',
            name: 'Leave Encashment', nameInPayslip: 'Leave Encashment',
            isActive: false, isSystem: false,
        },
        {
            tenantId, kind: 'correction', category: 'annual_leave_salary',
            name: 'Annual Leave Salary', nameInPayslip: 'Annual Leave Salary',
            isActive: false, isSystem: false,
        },
    ]
}
