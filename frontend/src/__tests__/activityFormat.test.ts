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

    it('maps the extended classification verbs', () => {
        expect(actionVerbFor('assign')).toBe('assigned')
        expect(actionVerbFor('unassign')).toBe('unassigned')
        expect(actionVerbFor('upload')).toBe('uploaded')
        expect(actionVerbFor('download')).toBe('downloaded')
        expect(actionVerbFor('permission_change')).toBe('changed permissions for')
        expect(actionVerbFor('role_change')).toBe('changed the role of')
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
