import { describe, it, expect } from 'vitest'
import { scoreMatch } from '../modules/recruitment/matching.engine.js'

describe('scoreMatch — skills', () => {
    it('full match → skills 100, no missing', () => {
        const r = scoreMatch({ skills: ['PHP', 'Laravel', 'MySQL'] }, { skills: ['PHP', 'Laravel', 'MySQL'] })
        expect(r.dimensions.skills).toBe(100)
        expect([...r.matchedSkills].sort()).toEqual(['Laravel', 'MySQL', 'PHP'])
        expect(r.missingSkills).toEqual([])
        expect(r.overall).toBe(100)
    })

    it('partial match reports matched + missing (the spec example)', () => {
        // Required: PHP, Laravel, React, MySQL — Candidate: PHP, Laravel, Vue.js, PostgreSQL
        const r = scoreMatch(
            { skills: ['PHP', 'Laravel', 'React', 'MySQL'] },
            { skills: ['PHP', 'Laravel', 'Vue.js', 'PostgreSQL'] },
        )
        expect([...r.matchedSkills].sort()).toEqual(['Laravel', 'PHP'])
        expect([...r.missingSkills].sort()).toEqual(['MySQL', 'React'])
        expect(r.dimensions.skills).toBe(50)
    })

    it('collapses synonyms (JS=JavaScript, ReactJS=React, node=Node.js)', () => {
        const r = scoreMatch({ skills: ['JavaScript', 'React', 'Node.js'] }, { skills: ['JS', 'ReactJS', 'node'] })
        expect(r.dimensions.skills).toBe(100)
        expect(r.missingSkills).toEqual([])
    })

    it('is case/whitespace insensitive', () => {
        const r = scoreMatch({ skills: ['Python'] }, { skills: ['  pythON '] })
        expect(r.dimensions.skills).toBe(100)
    })

    it('no candidate skills → zero match on a skills-only job', () => {
        const r = scoreMatch({ skills: ['PHP'] }, { skills: [] })
        expect(r.dimensions.skills).toBe(0)
        expect(r.matchedSkills).toEqual([])
        expect(r.overall).toBe(0)
    })

    it('no job skills → skills dimension omitted entirely', () => {
        const r = scoreMatch({ skills: [] }, { skills: ['PHP'] })
        expect(r.dimensions.skills).toBeUndefined()
    })
})

describe('scoreMatch — qualification', () => {
    it('matches job qualification tokens against candidate education', () => {
        const r = scoreMatch(
            { skills: ['PHP'], qualifications: ['Bachelor in Computer Science'] },
            { skills: ['PHP'], educationHistory: [{ degree: 'BSc', fieldOfStudy: 'Computer Science' }] },
        )
        expect(r.dimensions.qualification).toBe(100)
    })

    it('no education → qualification 0 when the job requires one', () => {
        const r = scoreMatch(
            { skills: ['PHP'], qualifications: ['Bachelor in Computer Science'] },
            { skills: ['PHP'], educationHistory: [] },
        )
        expect(r.dimensions.qualification).toBe(0)
    })
})

describe('scoreMatch — location & industry', () => {
    it('remote job → location is always 100', () => {
        const r = scoreMatch({ skills: ['PHP'], workplaceType: 'remote' }, { skills: ['PHP'] })
        expect(r.dimensions.location).toBe(100)
    })

    it('on-site: token hit = 100, miss = 40 (soft, relocation possible)', () => {
        const hit = scoreMatch(
            { skills: ['PHP'], workplaceType: 'on_site', location: 'Dubai, UAE' },
            { skills: ['PHP'], address: 'Jumeirah, Dubai' },
        )
        expect(hit.dimensions.location).toBe(100)
        const miss = scoreMatch(
            { skills: ['PHP'], workplaceType: 'on_site', location: 'Dubai' },
            { skills: ['PHP'], address: 'London' },
        )
        expect(miss.dimensions.location).toBe(40)
    })

    it('industry match from experience history', () => {
        const r = scoreMatch(
            { skills: ['PHP'], industry: 'Fintech' },
            { skills: ['PHP'], experienceHistory: [{ industry: 'Fintech' }] },
        )
        expect(r.dimensions.industry).toBe(100)
    })
})

describe('scoreMatch — weighting & explainability', () => {
    it('renormalises weights over applicable dimensions (skills-only job)', () => {
        const r = scoreMatch({ skills: ['A', 'B'] }, { skills: ['A'] })
        expect(r.dimensions.skills).toBe(50)
        // Only skills applies, so overall equals the skills score.
        expect(r.overall).toBe(50)
    })

    it('blends multiple applicable dimensions', () => {
        // skills 1.0 (w .6) + qualification 0 (w .2) + remote location 1.0 (w .1)
        // = (.6 + 0 + .1) / (.6 + .2 + .1) = .7/.9 ≈ 78
        const r = scoreMatch(
            { skills: ['PHP'], qualifications: ['MBA'], workplaceType: 'remote' },
            { skills: ['PHP'], educationHistory: [{ degree: 'BSc' }] },
        )
        expect(r.dimensions.skills).toBe(100)
        expect(r.dimensions.qualification).toBe(0)
        expect(r.dimensions.location).toBe(100)
        expect(r.overall).toBe(78)
    })

    it('produces human-readable strengths', () => {
        const r = scoreMatch({ skills: ['PHP', 'Laravel', 'MySQL'] }, { skills: ['PHP', 'Laravel', 'MySQL'] })
        expect(r.strengths.length).toBeGreaterThan(0)
        expect(r.strengths.join(' ')).toMatch(/skills/i)
    })

    it('handles empty job + empty candidate without throwing → overall 0', () => {
        const r = scoreMatch({}, {})
        expect(r.overall).toBe(0)
        expect(r.matchedSkills).toEqual([])
        expect(r.dimensions).toEqual({})
    })
})
