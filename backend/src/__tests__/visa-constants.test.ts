import { describe, it, expect } from 'vitest'
import { VISA_STEP_LABELS, VISA_TOTAL_STEPS, visaStepLabel } from '../modules/visa/visa.constants.js'

describe('VISA_STEP_LABELS', () => {
    it('defines a label for every step from 1 to VISA_TOTAL_STEPS', () => {
        for (let i = 1; i <= VISA_TOTAL_STEPS; i++) {
            const label = VISA_STEP_LABELS[i]
            expect(label, `step ${i} should have a label`).toBeTruthy()
            expect(typeof label).toBe('string')
        }
    })

    it('exposes 8 total steps (matches the visaSteps array on the frontend)', () => {
        expect(VISA_TOTAL_STEPS).toBe(8)
        expect(Object.keys(VISA_STEP_LABELS).length).toBe(8)
    })
})

describe('visaStepLabel', () => {
    it('returns the canonical label for a known step', () => {
        expect(visaStepLabel(1)).toBe(VISA_STEP_LABELS[1])
        expect(visaStepLabel(VISA_TOTAL_STEPS)).toBe(VISA_STEP_LABELS[VISA_TOTAL_STEPS])
    })

    it('returns "Unknown step" for null / undefined / 0 inputs', () => {
        expect(visaStepLabel(null)).toBe('Unknown step')
        expect(visaStepLabel(undefined)).toBe('Unknown step')
        expect(visaStepLabel(0)).toBe('Unknown step')
    })

    it('falls back to a synthetic label for an out-of-range step', () => {
        expect(visaStepLabel(99)).toBe('Step 99')
    })

    it('handles negative numbers without throwing', () => {
        expect(visaStepLabel(-1)).toBe('Step -1')
    })
})
