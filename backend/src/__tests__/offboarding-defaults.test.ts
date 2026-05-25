/**
 * Unit tests for the pure tenant-bootstrap row builders. These run inside
 * the transactional `signupOrg` + `createTenant` paths, so a regression
 * here would silently corrupt every new tenant's offboarding catalog.
 * Tests pin: row count, position ordering, the tenantId stamp, and the
 * default field values that the migrations also rely on (`isActive: true`,
 * the 30-day notice period default, etc).
 */
import { describe, it, expect } from 'vitest'
import {
    buildDefaultInterviewQuestionRows,
    buildDefaultExitDocumentRows,
    buildDefaultOffboardingSettingsRow,
    DEFAULT_INTERVIEW_QUESTIONS,
    DEFAULT_EXIT_DOCUMENTS,
} from '../modules/offboardingFlow/offboarding.defaults.js'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

describe('buildDefaultInterviewQuestionRows', () => {
    it('returns one row per default question, in order', () => {
        const rows = buildDefaultInterviewQuestionRows(TENANT_ID)
        expect(rows).toHaveLength(DEFAULT_INTERVIEW_QUESTIONS.length)
        expect(rows).toHaveLength(13) // pinned — used by the migration too
    })

    it('stamps the tenantId on every row', () => {
        const rows = buildDefaultInterviewQuestionRows(TENANT_ID)
        expect(rows.every(r => r.tenantId === TENANT_ID)).toBe(true)
    })

    it('assigns sequential positions starting at 0', () => {
        const rows = buildDefaultInterviewQuestionRows(TENANT_ID)
        rows.forEach((r, i) => expect(r.position).toBe(i))
    })

    it('marks every default question as active', () => {
        const rows = buildDefaultInterviewQuestionRows(TENANT_ID)
        expect(rows.every(r => r.isActive === true)).toBe(true)
    })

    it('preserves the configured questionType and required flag from the defaults', () => {
        const rows = buildDefaultInterviewQuestionRows(TENANT_ID)
        DEFAULT_INTERVIEW_QUESTIONS.forEach((q, i) => {
            expect(rows[i].questionText).toBe(q.questionText)
            expect(rows[i].questionType).toBe(q.questionType)
            expect(rows[i].required).toBe(q.required)
        })
    })
})

describe('buildDefaultExitDocumentRows', () => {
    it('returns one row per default document (Experience + Relieving)', () => {
        const rows = buildDefaultExitDocumentRows(TENANT_ID)
        expect(rows).toHaveLength(DEFAULT_EXIT_DOCUMENTS.length)
        expect(rows).toHaveLength(2)
    })

    it('stamps the tenantId on every row', () => {
        const rows = buildDefaultExitDocumentRows(TENANT_ID)
        expect(rows.every(r => r.tenantId === TENANT_ID)).toBe(true)
    })

    it('preserves the document name, body template, and required flag', () => {
        const rows = buildDefaultExitDocumentRows(TENANT_ID)
        DEFAULT_EXIT_DOCUMENTS.forEach((d, i) => {
            expect(rows[i].name).toBe(d.name)
            expect(rows[i].bodyTemplate).toBe(d.bodyTemplate)
            expect(rows[i].required).toBe(d.required)
        })
    })

    it('includes the {{employeeName}} placeholder in every default body — sanity check that templates use the runtime variable vocabulary', () => {
        const rows = buildDefaultExitDocumentRows(TENANT_ID)
        rows.forEach(r => {
            expect(r.bodyTemplate).toContain('{{employeeName}}')
        })
    })
})

describe('buildDefaultOffboardingSettingsRow', () => {
    it('stamps the tenantId', () => {
        const row = buildDefaultOffboardingSettingsRow(TENANT_ID)
        expect(row.tenantId).toBe(TENANT_ID)
    })

    it('applies the 30-day notice period default — used by Initiate Exit pre-fill', () => {
        const row = buildDefaultOffboardingSettingsRow(TENANT_ID)
        expect(row.noticePeriodValue).toBe(30)
        expect(row.noticePeriodUnit).toBe('days')
        expect(row.noticePeriodEnabled).toBe(true)
    })

    it('starts with no HR partners assigned — admins must opt in', () => {
        const row = buildDefaultOffboardingSettingsRow(TENANT_ID)
        expect(row.hrPartnerUserIds).toEqual([])
    })

    it('defaults the approval chain to 1 reporting level + HR partner gate', () => {
        const row = buildDefaultOffboardingSettingsRow(TENANT_ID)
        expect(row.approvalReportingLevels).toBe(1)
        expect(row.approvalRequireHrPartner).toBe(true)
    })

    it('sets the initial workflow trigger to on_request_added', () => {
        const row = buildDefaultOffboardingSettingsRow(TENANT_ID)
        expect(row.workflowTrigger).toBe('on_request_added')
    })
})
