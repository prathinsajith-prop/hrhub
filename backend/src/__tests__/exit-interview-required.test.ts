/**
 * Unit tests for the mandatory-question helper used by both submit
 * validation and the readiness gate. `isAnswerNonEmpty` is the single
 * source of truth — change the rules here and submit + readiness shift
 * together.
 */
import { describe, it, expect } from 'vitest'
import { isAnswerNonEmpty } from '../modules/offboardingFlow/offboarding.service.js'

describe('isAnswerNonEmpty — text', () => {
    it('treats whitespace-only short_text as empty', () => {
        expect(isAnswerNonEmpty('short_text', { answerText: '   ' })).toBe(false)
    })
    it('accepts non-blank short_text', () => {
        expect(isAnswerNonEmpty('short_text', { answerText: 'great' })).toBe(true)
    })
    it('rejects missing answer object', () => {
        expect(isAnswerNonEmpty('long_text', undefined)).toBe(false)
    })
    it('rejects null answerText for long_text', () => {
        expect(isAnswerNonEmpty('long_text', { answerText: null })).toBe(false)
    })
})

describe('isAnswerNonEmpty — rating', () => {
    it('accepts a positive numeric answerValue', () => {
        expect(isAnswerNonEmpty('rating', { answerValue: 8 })).toBe(true)
    })
    it('accepts a stringy answerText that parses to a positive number', () => {
        expect(isAnswerNonEmpty('rating', { answerText: '7' })).toBe(true)
    })
    it('rejects zero', () => {
        expect(isAnswerNonEmpty('rating', { answerValue: 0 })).toBe(false)
    })
    it('rejects NaN / non-numeric text', () => {
        expect(isAnswerNonEmpty('rating', { answerText: 'abc' })).toBe(false)
    })
})

describe('isAnswerNonEmpty — yes_no', () => {
    it('accepts a boolean answerValue', () => {
        expect(isAnswerNonEmpty('yes_no', { answerValue: true })).toBe(true)
        expect(isAnswerNonEmpty('yes_no', { answerValue: false })).toBe(true)
    })
    it('accepts "yes" / "no" / "true" / "false" text (case-insensitive)', () => {
        expect(isAnswerNonEmpty('yes_no', { answerText: 'Yes' })).toBe(true)
        expect(isAnswerNonEmpty('yes_no', { answerText: 'NO' })).toBe(true)
        expect(isAnswerNonEmpty('yes_no', { answerText: 'true' })).toBe(true)
    })
    it('rejects unrelated text', () => {
        expect(isAnswerNonEmpty('yes_no', { answerText: 'maybe' })).toBe(false)
    })
})

describe('isAnswerNonEmpty — choice', () => {
    it('single_choice accepts non-empty string in either field', () => {
        expect(isAnswerNonEmpty('single_choice', { answerValue: 'opt-a' })).toBe(true)
        expect(isAnswerNonEmpty('single_choice', { answerText: 'opt-b' })).toBe(true)
    })
    it('single_choice rejects empty string', () => {
        expect(isAnswerNonEmpty('single_choice', { answerValue: '' })).toBe(false)
    })
    it('multi_choice accepts a non-empty array', () => {
        expect(isAnswerNonEmpty('multi_choice', { answerValue: ['a'] })).toBe(true)
    })
    it('multi_choice rejects empty array', () => {
        expect(isAnswerNonEmpty('multi_choice', { answerValue: [] })).toBe(false)
    })
    it('multi_choice rejects non-array', () => {
        expect(isAnswerNonEmpty('multi_choice', { answerText: 'a,b,c' })).toBe(false)
    })
})
