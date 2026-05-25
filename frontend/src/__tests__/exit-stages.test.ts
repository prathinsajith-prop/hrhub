/**
 * Unit tests for the offboarding-flow stage derivation logic that powers
 * both the list-row progress badge and the detail timeline.
 *
 * `deriveStages` is the single source of truth — change here, both UIs
 * shift together. These tests pin every state transition.
 */
import { describe, it, expect } from 'vitest'
import { deriveStages } from '@/pages/employees/ExitStagesTimeline'
import type { ExitRequest } from '@/hooks/useExit'

/** Build a minimum-viable ExitRequest with overrides. */
function exit(overrides: Partial<ExitRequest> = {}): ExitRequest {
    return {
        id: 'exit-1',
        tenantId: 't-1',
        employeeId: 'emp-1',
        exitType: 'resignation',
        exitDate: '2026-06-01',
        lastWorkingDay: '2026-06-30',
        noticePeriodDays: '30',
        status: 'pending',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
        clearanceTotal: 0,
        clearanceCompleted: 0,
        interviewSubmitted: false,
        settlementPaid: false,
        ...overrides,
    }
}

describe('deriveStages — Submitted', () => {
    it('is always done once the request exists', () => {
        const stages = deriveStages(exit())
        expect(stages.find(s => s.key === 'submitted')?.state).toBe('done')
    })
})

describe('deriveStages — Clearance', () => {
    it('is pending when there are no clearance items', () => {
        const stages = deriveStages(exit({ clearanceTotal: 0, clearanceCompleted: 0 }))
        expect(stages.find(s => s.key === 'clearance')?.state).toBe('pending')
    })

    it('is active when some items are still open', () => {
        const stages = deriveStages(exit({ clearanceTotal: 3, clearanceCompleted: 1 }))
        expect(stages.find(s => s.key === 'clearance')?.state).toBe('active')
    })

    it('is done when every item is completed', () => {
        const stages = deriveStages(exit({ clearanceTotal: 3, clearanceCompleted: 3 }))
        expect(stages.find(s => s.key === 'clearance')?.state).toBe('done')
    })
})

describe('deriveStages — Exit Interview', () => {
    it('is pending until the employee submits at least one answer', () => {
        const stages = deriveStages(exit({ interviewSubmitted: false }))
        expect(stages.find(s => s.key === 'interview')?.state).toBe('pending')
    })

    it('flips to done once submitted', () => {
        const stages = deriveStages(exit({ interviewSubmitted: true }))
        expect(stages.find(s => s.key === 'interview')?.state).toBe('done')
    })
})

describe('deriveStages — Approval', () => {
    it('is pending while clearances are still open', () => {
        const stages = deriveStages(exit({ status: 'pending', clearanceTotal: 2, clearanceCompleted: 0 }))
        expect(stages.find(s => s.key === 'approval')?.state).toBe('pending')
    })

    it('flips to active once clearance is done but approval still pending', () => {
        const stages = deriveStages(exit({ status: 'pending', clearanceTotal: 2, clearanceCompleted: 2 }))
        expect(stages.find(s => s.key === 'approval')?.state).toBe('active')
    })

    it('is done when status is approved', () => {
        const stages = deriveStages(exit({ status: 'approved' }))
        expect(stages.find(s => s.key === 'approval')?.state).toBe('done')
    })

    it('is done when status is completed', () => {
        const stages = deriveStages(exit({ status: 'completed' }))
        expect(stages.find(s => s.key === 'approval')?.state).toBe('done')
    })
})

describe('deriveStages — Settlement', () => {
    it('is pending until approval', () => {
        const stages = deriveStages(exit({ status: 'pending' }))
        expect(stages.find(s => s.key === 'settlement')?.state).toBe('pending')
    })

    it('is active when approved but not yet paid', () => {
        const stages = deriveStages(exit({ status: 'approved', settlementPaid: false }))
        expect(stages.find(s => s.key === 'settlement')?.state).toBe('active')
    })

    it('is done when settlementPaid', () => {
        const stages = deriveStages(exit({ status: 'completed', settlementPaid: true }))
        expect(stages.find(s => s.key === 'settlement')?.state).toBe('done')
    })
})

describe('deriveStages — Closed', () => {
    it('only flips to done at status=completed', () => {
        expect(deriveStages(exit({ status: 'pending' })).find(s => s.key === 'closed')?.state).toBe('pending')
        expect(deriveStages(exit({ status: 'approved' })).find(s => s.key === 'closed')?.state).toBe('pending')
        expect(deriveStages(exit({ status: 'completed' })).find(s => s.key === 'closed')?.state).toBe('done')
    })
})

describe('deriveStages — rejected short-circuit', () => {
    it('dims clearance / interview / approval / settlement when status is rejected', () => {
        const stages = deriveStages(exit({
            status: 'rejected',
            clearanceTotal: 3,
            clearanceCompleted: 3,
            interviewSubmitted: true,
        }))
        // Submitted stays done; everything else turns pending.
        expect(stages.find(s => s.key === 'submitted')?.state).toBe('done')
        for (const key of ['clearance', 'interview', 'approval', 'settlement', 'closed'] as const) {
            expect(stages.find(s => s.key === key)?.state).toBe('pending')
        }
    })
})

describe('deriveStages — invariants', () => {
    it('always returns six stages in canonical order', () => {
        const keys = deriveStages(exit()).map(s => s.key)
        expect(keys).toEqual(['submitted', 'clearance', 'interview', 'approval', 'settlement', 'closed'])
    })

    it('never returns more than one "active" stage', () => {
        // Sanity check across a variety of inputs
        const cases: Array<Partial<ExitRequest>> = [
            { clearanceTotal: 2, clearanceCompleted: 1 },
            { clearanceTotal: 2, clearanceCompleted: 2, status: 'pending' },
            { status: 'approved', settlementPaid: false },
            { status: 'completed', settlementPaid: true },
            { status: 'rejected' },
            {},
        ]
        for (const c of cases) {
            const activeCount = deriveStages(exit(c)).filter(s => s.state === 'active').length
            expect(activeCount).toBeLessThanOrEqual(1)
        }
    })
})
