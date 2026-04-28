/**
 * Canonical labels for the standard 8-step UAE work-visa workflow.
 *
 * IMPORTANT: keep this in lock-step with `visaSteps` in the frontend
 * (`frontend/src/pages/visa/VisaDetailPage.tsx` /
 * `frontend/src/components/visa/AdvanceStageCostsDialog.tsx`).
 *
 * Indexed 1-based to match the `current_step` column on `visa_applications`.
 */
export const VISA_STEP_LABELS: Record<number, string> = {
    1: 'Entry Permit Application',
    2: 'Entry Permit Approval',
    3: 'Employee Entry to UAE',
    4: 'Medical Fitness Test',
    5: 'Emirates ID Biometrics',
    6: 'Visa Stamping',
    7: 'Labour Card Issuance',
    8: 'Completion',
}

export const VISA_TOTAL_STEPS = 8

export function visaStepLabel(step: number | null | undefined): string {
    if (!step) return 'Unknown step'
    return VISA_STEP_LABELS[step] ?? `Step ${step}`
}
