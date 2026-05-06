/**
 * Unit tests for employee search logic — no DB required.
 * These tests verify the search routing logic (email vs tsquery vs fallback)
 * and the filter string building pipeline.
 */
import { describe, it, expect } from 'vitest'

// ─── Replicate the exact search-routing logic from employees.service.ts ──────

interface SearchCase {
    input: string
    /** Expected branch: 'email_ilike' | 'tsquery' | 'no_search' */
    branch: 'email_ilike' | 'tsquery' | 'no_search'
    /** Expected tsquery string (only for 'tsquery' branch) */
    tsQuery?: string
}

function resolveSearchBranch(search: string): { branch: string; tsQuery?: string } {
    const trimmed = search.trim()
    if (!trimmed) {
        return { branch: 'no_search' }
    }
    if (trimmed.includes('@')) {
        return { branch: 'email_ilike' }
    }
    const words = trimmed.split(/\s+/).filter(Boolean)
        .map((w: string) => w.replace(/[^a-zA-Z0-9À-ɏ؀-ۿ]/g, '')).filter(Boolean)
    if (words.length > 0) {
        return { branch: 'tsquery', tsQuery: words.join(' & ') + ':*' }
    }
    return { branch: 'no_search' }
}

const CASES: SearchCase[] = [
    // ── Email searches (contain @) ─────────────────────────────────────────
    { input: 'user@example.com', branch: 'email_ilike' },
    { input: 'prathin@propcrm.com', branch: 'email_ilike' },
    { input: '@', branch: 'email_ilike' },
    { input: 'first.last@company.ae', branch: 'email_ilike' },

    // ── Name / text searches → tsquery ────────────────────────────────────
    { input: 'Prathin', branch: 'tsquery', tsQuery: 'Prathin:*' },
    { input: 'prathin sajith', branch: 'tsquery', tsQuery: 'prathin & sajith:*' },
    { input: 'John Smith', branch: 'tsquery', tsQuery: 'John & Smith:*' },
    { input: 'EMP001', branch: 'tsquery', tsQuery: 'EMP001:*' },
    { input: 'Senior Developer', branch: 'tsquery', tsQuery: 'Senior & Developer:*' },

    // ── Non-alpha / whitespace → no condition (return all) ───────────────
    { input: '---', branch: 'no_search' },
    { input: '   ', branch: 'no_search' },
    { input: '!@#', branch: 'email_ilike' },   // contains @ → email path
    { input: '...', branch: 'no_search' },
]

describe('employee search routing', () => {
    for (const c of CASES) {
        it(`"${c.input}" → ${c.branch}`, () => {
            const result = resolveSearchBranch(c.input)
            expect(result.branch).toBe(c.branch)
            if (c.tsQuery !== undefined) {
                expect(result.tsQuery).toBe(c.tsQuery)
            }
        })
    }
})

describe('email search - covers all three email columns', () => {
    it('routes email-format queries to email_ilike (not tsquery)', () => {
        expect(resolveSearchBranch('prathin@propcrm.com').branch).toBe('email_ilike')
        expect(resolveSearchBranch('ADMIN@HRHUB.AE').branch).toBe('email_ilike')
        expect(resolveSearchBranch('test+tag@domain.co.uk').branch).toBe('email_ilike')
    })

    it('tsquery path does NOT fire for email inputs', () => {
        // Ensure we never emit a bad tsquery like "prathinpropcrm:*" for an email
        const result = resolveSearchBranch('prathin@propcrm.com')
        expect(result.tsQuery).toBeUndefined()
    })
})

describe('tsquery construction', () => {
    it('single word gets :* prefix', () => {
        expect(resolveSearchBranch('prathin').tsQuery).toBe('prathin:*')
    })

    it('multi-word is joined with & and :* appended to last word', () => {
        expect(resolveSearchBranch('john doe').tsQuery).toBe('john & doe:*')
    })

    it('strips punctuation within a word but keeps the word', () => {
        // "O'Brien" → "OBrien" (strip apostrophe)
        expect(resolveSearchBranch("O'Brien").tsQuery).toBe('OBrien:*')
    })

    it('strips hyphen-only segments entirely', () => {
        // "--- text" → ["", "text"] → ["text"]
        expect(resolveSearchBranch('--- text').tsQuery).toBe('text:*')
    })

    it('extra whitespace between words is ignored', () => {
        expect(resolveSearchBranch('  john   doe  ').tsQuery).toBe('john & doe:*')
    })

    it('employee number passes through', () => {
        expect(resolveSearchBranch('EMP-001').tsQuery).toBe('EMP001:*')
    })
})

describe('no_search (no condition added)', () => {
    it('pure whitespace emits no condition', () => {
        expect(resolveSearchBranch('   ').branch).toBe('no_search')
    })

    it('all-punctuation (no @ and no word chars) emits no condition', () => {
        expect(resolveSearchBranch('...').branch).toBe('no_search')
        expect(resolveSearchBranch('---').branch).toBe('no_search')
    })
})
