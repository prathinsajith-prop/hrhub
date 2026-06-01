/**
 * Unit tests for the shared audit / activity-log formatting helpers.
 * Pure logic — no React, no network. These pin the label humanization,
 * value type-inference, action verbs, and relative-time output that the
 * Updates tab and the global Audit Log page both render.
 */
import { describe, it, expect } from 'vitest'
import {
    humanizeFieldLabel,
    formatChangeValue,
    actionVerbFor,
    timeAgo,
    formatChangeEntries,
    FIELD_LABEL_OVERRIDES,
} from '@/lib/activityFormat'

describe('humanizeFieldLabel', () => {
    it('uses explicit overrides when present', () => {
        expect(humanizeFieldLabel('firstName')).toBe('First Name')
        expect(humanizeFieldLabel('orgUnitId')).toBe('Department')
        expect(humanizeFieldLabel('iban')).toBe('IBAN')
    })

    it('splits camelCase into title-cased words', () => {
        expect(humanizeFieldLabel('someRandomField')).toBe('Some Random Field')
    })

    it('splits snake_case and kebab-case', () => {
        expect(humanizeFieldLabel('some_random_field')).toBe('Some Random Field')
        expect(humanizeFieldLabel('some-random-field')).toBe('Some Random Field')
    })

    it('re-uppercases common acronyms after title-casing', () => {
        expect(humanizeFieldLabel('vendorId')).toBe('Vendor ID')
        expect(humanizeFieldLabel('webhookUrl')).toBe('Webhook URL')
        expect(humanizeFieldLabel('uaeRegion')).toBe('UAE Region')
        expect(humanizeFieldLabel('hrContact')).toBe('HR Contact')
    })

    it('every override maps to a non-empty label', () => {
        for (const [key, label] of Object.entries(FIELD_LABEL_OVERRIDES)) {
            expect(label, key).toBeTruthy()
        }
    })
})

describe('formatChangeValue', () => {
    it('renders empty-ish values as an em dash', () => {
        expect(formatChangeValue('notes', null)).toBe('—')
        expect(formatChangeValue('notes', undefined)).toBe('—')
        expect(formatChangeValue('notes', '')).toBe('—')
    })

    it('renders booleans as Yes/No', () => {
        expect(formatChangeValue('isActive', true)).toBe('Yes')
        expect(formatChangeValue('isActive', false)).toBe('No')
    })

    it('formats money-hinted numbers as currency and leaves others raw', () => {
        expect(formatChangeValue('basicSalary', 5000)).toContain('5,000')
        expect(formatChangeValue('headcount', 42)).toBe('42')
    })

    it('formats date-like strings and date-hinted fields', () => {
        // ISO date is detected by value shape regardless of field name.
        expect(formatChangeValue('whatever', '2026-06-01')).not.toBe('2026-06-01')
        // A date-hinted field name triggers formatting too.
        expect(formatChangeValue('joinDate', '2026-06-01')).not.toBe('2026-06-01')
    })

    it('passes plain strings through unchanged', () => {
        expect(formatChangeValue('notes', 'Hello world')).toBe('Hello world')
    })

    it('summarizes arrays by length', () => {
        expect(formatChangeValue('tags', [])).toBe('—')
        expect(formatChangeValue('tags', ['a'])).toBe('1 item')
        expect(formatChangeValue('tags', ['a', 'b'])).toBe('2 items')
    })

    it('JSON-stringifies plain objects', () => {
        expect(formatChangeValue('meta', { a: 1 })).toBe('{"a":1}')
    })

    // --- ID-typed fields: never leak a raw UUID into the UI ---
    it('hides raw UUID values on ID-typed fields (em dash)', () => {
        const uuid = '3f9b2c1a-4d5e-6f7a-8b9c-0d1e2f3a4b5c'
        expect(formatChangeValue('orgUnitId', uuid)).toBe('—')
        expect(formatChangeValue('reportingTo', uuid)).toBe('—')
        expect(formatChangeValue('managerId', uuid)).toBe('—')
        expect(formatChangeValue('teamId', uuid)).toBe('—')
        // Any field ending in "Id" is treated as ID-typed.
        expect(formatChangeValue('vendorId', uuid)).toBe('—')
    })

    it('does not hide non-UUID strings on ID-typed fields', () => {
        // A human-readable code on an ID field should still render as-is.
        expect(formatChangeValue('vendorId', 'ACME-001')).toBe('ACME-001')
    })

    it('renders the name/label from a denormalized { id, name } reference', () => {
        const uuid = '3f9b2c1a-4d5e-6f7a-8b9c-0d1e2f3a4b5c'
        expect(formatChangeValue('orgUnitId', { id: uuid, name: 'Engineering' })).toBe('Engineering')
        expect(formatChangeValue('designationId', { id: uuid, label: 'Senior Engineer' })).toBe('Senior Engineer')
        // Works on non-ID fields too (forward-compatible).
        expect(formatChangeValue('whatever', { id: uuid, name: 'Marketing' })).toBe('Marketing')
    })

    // --- Enum / status humanization ---
    it('humanizes snake_case enum values to Title Case', () => {
        expect(formatChangeValue('attendanceType', 'half_day')).toBe('Half Day')
        expect(formatChangeValue('docState', 'pending_upload')).toBe('Pending Upload')
        expect(formatChangeValue('availability', 'on_leave')).toBe('On Leave')
        expect(formatChangeValue('reviewState', 'under_review')).toBe('Under Review')
    })

    it('humanizes status-like field values even when single-token', () => {
        expect(formatChangeValue('employeeStatus', 'active')).toBe('Active')
    })

    it('special-cases wfh to WFH', () => {
        expect(formatChangeValue('attendanceType', 'wfh')).toBe('WFH')
    })

    it('does not mangle free-text strings', () => {
        expect(formatChangeValue('notes', 'hello world')).toBe('hello world')
        expect(formatChangeValue('remarks', 'Approved by manager.')).toBe('Approved by manager.')
    })

    // --- Object fallback never renders [object Object] ---
    it('never renders [object Object] for plain objects', () => {
        expect(formatChangeValue('meta', { a: 1, b: 2 })).not.toContain('[object Object]')
    })

    it('falls back to a safe summary for circular / unstringifiable objects', () => {
        const circular: Record<string, unknown> = {}
        circular.self = circular
        const out = formatChangeValue('meta', circular)
        expect(out).not.toContain('[object Object]')
        expect(out).toBe('(details)')
    })
})

describe('actionVerbFor', () => {
    it('maps known actions to past tense', () => {
        expect(actionVerbFor('create')).toBe('created')
        expect(actionVerbFor('update')).toBe('updated')
        expect(actionVerbFor('approve')).toBe('approved')
        expect(actionVerbFor('login')).toBe('logged into')
    })

    it('falls back to a de-underscored verb for unknown actions', () => {
        expect(actionVerbFor('bulk_import')).toBe('bulk import')
        expect(actionVerbFor('frobnicate')).toBe('frobnicate')
    })
})

describe('timeAgo', () => {
    const now = new Date('2026-06-01T12:00:00Z').getTime()

    it('shows "just now" under a minute', () => {
        expect(timeAgo('2026-06-01T11:59:30Z', now)).toBe('just now')
    })

    it('shows minutes, hours, and days', () => {
        expect(timeAgo('2026-06-01T11:30:00Z', now)).toBe('30m ago')
        expect(timeAgo('2026-06-01T09:00:00Z', now)).toBe('3h ago')
        expect(timeAgo('2026-05-30T12:00:00Z', now)).toBe('2d ago')
    })

    it('falls back to a formatted date beyond a week', () => {
        const label = timeAgo('2026-01-01T12:00:00Z', now)
        expect(label).not.toMatch(/ago$/)
        expect(label).toBeTruthy()
    })
})

describe('formatChangeEntries', () => {
    it('returns an empty array for null/undefined', () => {
        expect(formatChangeEntries(null)).toEqual([])
        expect(formatChangeEntries(undefined)).toEqual([])
    })

    it('maps each change to key + humanized label + formatted from/to', () => {
        const entries = formatChangeEntries({
            firstName: { from: 'Ali', to: 'Omar' },
            isActive: { from: false, to: true },
        })
        expect(entries).toEqual([
            { key: 'firstName', label: 'First Name', from: 'Ali', to: 'Omar' },
            { key: 'isActive', label: 'Active', from: 'No', to: 'Yes' },
        ])
    })
})
