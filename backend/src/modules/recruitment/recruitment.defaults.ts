/**
 * Default recruitment pipeline stages seeded for each new tenant.
 *
 * Stage keys are fixed (they must match the `jobApplications.stage` union).
 * Tenants customise label / color / order via Organization Settings →
 * Recruitment Stages. Terminal stages are hidden from the kanban board on
 * the client side but still appear in list views and the candidate profile.
 *
 * The colorKey resolves to a (bg, dot) Tailwind class pair on the client —
 * see `frontend/src/lib/recruitmentStages.ts` for the palette. Keep the
 * palette keys here in sync with that file.
 */
export const DEFAULT_RECRUITMENT_STAGES = [
    { stageOrder: 1, stageKey: 'received',     label: 'Received',     colorKey: 'slate',   isTerminal: false },
    { stageOrder: 2, stageKey: 'screening',    label: 'Screening',    colorKey: 'blue',    isTerminal: false },
    { stageOrder: 3, stageKey: 'interview',    label: 'Interview',    colorKey: 'amber',   isTerminal: false },
    { stageOrder: 4, stageKey: 'assessment',   label: 'Assessment',   colorKey: 'primary', isTerminal: false },
    { stageOrder: 5, stageKey: 'offer',        label: 'Offer',        colorKey: 'green',   isTerminal: false },
    { stageOrder: 6, stageKey: 'pre_boarding', label: 'Pre-boarding', colorKey: 'emerald', isTerminal: false },
    { stageOrder: 7, stageKey: 'rejected',     label: 'Rejected',     colorKey: 'red',     isTerminal: true  },
] as const

export type DefaultRecruitmentStage = (typeof DEFAULT_RECRUITMENT_STAGES)[number]

/**
 * Builds the seed-row payload for `recruitmentStages` from the defaults. Used
 * by tenant creation (auth.signupTenant, tenants.createTenant) and lazy seed
 * / reset in recruitment.service.
 */
export function buildDefaultRecruitmentStageRows(tenantId: string) {
    return DEFAULT_RECRUITMENT_STAGES.map(s => ({
        tenantId,
        stageOrder: s.stageOrder,
        stageKey: s.stageKey,
        label: s.label,
        colorKey: s.colorKey,
        isTerminal: s.isTerminal,
    }))
}
