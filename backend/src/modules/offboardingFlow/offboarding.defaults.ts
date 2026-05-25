// ─── Default exit-interview question set ────────────────────────────────────
// Mirrors the Zoho People default exit-interview template. Seeded lazily on
// first GET for any tenant that has no questions yet, and back-filled by
// migration 0066 for tenants that already exist. The list is the single source
// of truth — change here, re-run the migration's INSERT…NOT EXISTS section if
// you also want to push the change into existing tenants.

export interface DefaultQuestion {
    questionText: string
    questionType: 'short_text' | 'long_text' | 'rating' | 'single_choice' | 'multi_choice' | 'yes_no'
    required: boolean
}

// ─── Default exit-document templates ────────────────────────────────────────
// Two standard letters every UAE HR team issues: Experience Letter (to-whom-
// it-may-concern certificate) and Relieving Letter (acceptance + final
// settlement confirmation). Variables follow the same vocabulary the workflow
// engine expands at send time: {{employeeName}}, {{employeeNo}},
// {{designation}}, {{joinDate}}, {{exitDate}}, {{lastWorkingDay}},
// {{companyName}}, {{today}}.

export interface DefaultExitDocument {
    name: string
    required: boolean
    bodyTemplate: string
}

export const DEFAULT_EXIT_DOCUMENTS: DefaultExitDocument[] = [
    {
        name: 'Experience Letter',
        required: true,
        bodyTemplate: `<p style="text-align:right">{{today}}</p>
<p>To whom it may concern,</p>
<p>This is to certify that <strong>{{employeeName}}</strong>, employee number <strong>{{employeeNo}}</strong>, worked as <strong>{{designation}}</strong> in our organization from <strong>{{joinDate}}</strong> to <strong>{{lastWorkingDay}}</strong>.</p>
<p>{{employeeName}} performed his/her/their role and responsibilities successfully.</p>
<p>We are certain that he/she/they will be an asset to any organization.</p>
<p>We wish you all success in your new endeavours.</p>
<p>Sincerely,<br/>{{companyName}}<br/>HR Manager / HR Team</p>`,
    },
    {
        name: 'Relieving Letter',
        required: true,
        bodyTemplate: `<p style="text-align:right">{{today}}</p>
<p>Dear {{employeeName}},</p>
<p>In response to your resignation letter, we would like to inform you that we accept your resignation.</p>
<p>Your notice period will conclude on <strong>{{lastWorkingDay}}</strong>, following which you will be relieved from the service of the company at the close of business.</p>
<p>We confirm that your full and final settlement has been cleared by the organization.</p>
<p>We value your contribution to the success of the company.</p>
<p>We wish you all success in your new endeavours.</p>
<p>Sincerely,<br/>{{companyName}}<br/>HR Manager / HR Team</p>`,
    },
]

// ─── Row builders for transactional tenant bootstrap ────────────────────────
// Called from auth.service.signupOrg() and tenants.service.createTenant() —
// both flows insert these row sets inside the same DB transaction that
// creates the tenants row, so a new org has a complete offboarding flow
// configured from the very first login. The lazy-seed in offboarding.service
// remains as a safety net for tenants created before this hook landed.

export function buildDefaultInterviewQuestionRows(tenantId: string) {
    return DEFAULT_INTERVIEW_QUESTIONS.map((q, i) => ({
        tenantId,
        questionText: q.questionText,
        questionType: q.questionType,
        required: q.required,
        position: i,
        isActive: true,
    }))
}

export function buildDefaultExitDocumentRows(tenantId: string) {
    return DEFAULT_EXIT_DOCUMENTS.map((d, i) => ({
        tenantId,
        name: d.name,
        bodyTemplate: d.bodyTemplate,
        required: d.required,
        position: i,
        isActive: true,
    }))
}

export function buildDefaultOffboardingSettingsRow(tenantId: string) {
    return {
        tenantId,
        noticePeriodEnabled: true,
        noticePeriodValue: 30,
        noticePeriodUnit: 'days' as const,
        hrPartnerUserIds: [] as string[],
        approvalReportingLevels: 1,
        approvalRequireHrPartner: true,
        workflowTrigger: 'on_request_added' as const,
    }
}

export const DEFAULT_INTERVIEW_QUESTIONS: DefaultQuestion[] = [
    { questionText: 'In your role in the organization, what aspects did you find to be the most engaging, and what areas did you find to be of least significance?', questionType: 'long_text', required: false },
    { questionText: 'If you could change one thing about your experience here, what would it be?', questionType: 'long_text', required: false },
    { questionText: 'Did you feel well-supported by your manager and colleagues?', questionType: 'yes_no', required: false },
    { questionText: 'Was the workload and work-life balance manageable in your role?', questionType: 'long_text', required: false },
    { questionText: "Is there anything else you'd like to share about your experience?", questionType: 'long_text', required: false },
    { questionText: 'What changes could we have made that would have encouraged you to stay employed here?', questionType: 'long_text', required: false },
    { questionText: 'Would you recommend this company to your family or friends?', questionType: 'long_text', required: false },
    { questionText: 'What are some of the aspects you enjoyed while working with us?', questionType: 'long_text', required: false },
    { questionText: 'Rate your experience between 1 and 10. With 1 being the lowest and 10 being the highest.', questionType: 'rating', required: false },
    { questionText: 'Did you have good opportunities to develop and improve?', questionType: 'long_text', required: false },
    { questionText: 'Did you feel valued as an employee?', questionType: 'yes_no', required: false },
    { questionText: 'Were you satisfied with the compensation (salary) and benefits received?', questionType: 'yes_no', required: false },
    { questionText: 'Did your manager acknowledge your feedback?', questionType: 'yes_no', required: false },
]
