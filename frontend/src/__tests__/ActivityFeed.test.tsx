import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
    buildActivityHeadline,
    type ActivityHeadlineLog,
} from '@/components/shared/ActivityFeed'

function makeLog(
    kind: string | undefined,
    subKind: string | undefined,
    action: string,
    extra: Partial<ActivityHeadlineLog> = {},
): ActivityHeadlineLog {
    return {
        actorName: 'Alice',
        action,
        entityType: kind ?? 'employee',
        entityName: 'Test Entity',
        metadata: kind ? { kind, ...(subKind ? { subKind } : {}) } : null,
        ...extra,
    }
}

/** Render a headline node into the DOM and return its text content. */
function renderHeadline(
    log: ActivityHeadlineLog,
    changeCount = 0,
    viewer: 'self' | 'hr' = 'hr',
): string {
    render(<div data-testid="hl">{buildActivityHeadline(log, changeCount, viewer)}</div>)
    return screen.getByTestId('hl').textContent ?? ''
}

describe('buildActivityHeadline', () => {
    const cases: Array<{
        name: string
        kind: string
        subKind?: string
        action: string
        expected: string
    }> = [
        { name: 'document', kind: 'document', subKind: 'upload', action: 'create', expected: 'uploaded a document' },
        { name: 'attendance', kind: 'attendance', subKind: 'punch-in', action: 'create', expected: 'punched in' },
        { name: 'payroll', kind: 'payroll', subKind: 'run', action: 'create', expected: 'ran payroll' },
        { name: 'leave', kind: 'leave', subKind: 'request', action: 'submit', expected: 'requested leave' },
        { name: 'loan', kind: 'loan', subKind: 'request', action: 'submit', expected: 'requested a loan' },
        { name: 'visa', kind: 'visa', subKind: 'advance', action: 'update', expected: 'advanced a visa application' },
        { name: 'transfer', kind: 'transfer', subKind: 'request', action: 'create', expected: 'requested a transfer' },
        { name: 'exit', kind: 'exit', subKind: 'settle', action: 'update', expected: 'recorded an exit settlement' },
        { name: 'asset', kind: 'asset', subKind: 'assign', action: 'update', expected: 'assigned an asset' },
        { name: 'performance', kind: 'performance', subKind: 'submit', action: 'submit', expected: 'submitted a performance review' },
        { name: 'security', kind: 'security', subKind: 'password', action: 'update', expected: 'changed the password' },
        { name: 'profile', kind: 'profile', subKind: 'avatar', action: 'update', expected: 'updated the profile photo' },
        { name: 'onboarding', kind: 'onboarding', subKind: 'step-complete', action: 'update', expected: 'completed an onboarding step' },
        { name: 'offboarding', kind: 'offboarding', subKind: 'approve', action: 'approve', expected: 'approved an exit request' },
    ]

    for (const c of cases) {
        it(`renders a kind-specific headline for ${c.name}`, () => {
            const text = renderHeadline(makeLog(c.kind, c.subKind, c.action))
            expect(text).toContain('Alice')
            expect(text).toContain(c.expected)
            expect(text).toContain('Test Entity')
        })
    }

    it('renders the actor name by default (viewer="hr")', () => {
        const text = renderHeadline(makeLog('document', 'upload', 'create'))
        expect(text).toContain('Alice')
        expect(text).not.toContain('You')
    })

    it('renders "You" when viewer is "self"', () => {
        const text = renderHeadline(makeLog('profile', 'contact', 'update'), 0, 'self')
        expect(text).toContain('You')
        expect(text).toContain('updated contact details')
    })

    it('falls back to a field-count headline for a kind-less update', () => {
        const log = makeLog(undefined, undefined, 'update', { entityName: null })
        const text = renderHeadline(log, 3)
        expect(text).toContain('Alice')
        expect(text).toContain('updated 3 fields')
    })

    it('uses singular "field" for a single-field update', () => {
        const text = renderHeadline(makeLog(undefined, undefined, 'update', { entityName: null }), 1)
        expect(text).toContain('updated 1 field')
        expect(text).not.toContain('1 fields')
    })

    it('falls back to "updated this record" when no change count is given', () => {
        const text = renderHeadline(makeLog(undefined, undefined, 'update', { entityName: null }), 0)
        expect(text).toContain('updated this record')
    })

    it('falls back to a generic action verb for non-update actions without a kind', () => {
        const text = renderHeadline(makeLog(undefined, undefined, 'delete', { entityName: null }))
        expect(text).toContain('deleted')
    })

    it('falls back to the generic headline for an unknown kind', () => {
        const log: ActivityHeadlineLog = {
            actorName: 'Bob',
            action: 'create',
            entityType: 'widget',
            entityName: 'Widget X',
            metadata: { kind: 'somethingNew' },
        }
        const text = renderHeadline(log)
        expect(text).toContain('Bob')
        expect(text).toContain('created')
        expect(text).toContain('Widget X')
    })

    it('renders "System" when there is no actor name', () => {
        const text = renderHeadline(makeLog('payroll', 'run', 'create', { actorName: null }))
        expect(text).toContain('System')
        expect(text).toContain('ran payroll')
    })
})
