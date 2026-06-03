import { describe, it, expect } from 'vitest'
import { parseResumeText } from '@/lib/resume-parser'

const FULL = `Jane Smith
Senior Software Engineer
jane.smith@example.com | +971 50 123 4567
LinkedIn: https://www.linkedin.com/in/janesmith
GitHub: https://github.com/janesmith
Summary: 6 years of experience building scalable web apps.
Skills: React, TypeScript, Node.js, PostgreSQL, AWS, Docker
`

describe('parseResumeText', () => {
    it('extracts the core contact + profile fields', () => {
        const p = parseResumeText(FULL)
        expect(p.name).toBe('Jane Smith')
        expect(p.email).toBe('jane.smith@example.com')
        expect(p.phone?.replace(/\D/g, '')).toContain('971501234567')
        expect(p.linkedin).toContain('linkedin.com/in/janesmith')
        expect(p.github).toContain('github.com/janesmith')
        expect(p.experienceYears).toBe(6)
        expect(p.skills).toEqual(expect.arrayContaining(['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'AWS', 'Docker']))
        expect(p.textLength).toBe(FULL.length)
    })

    it('keeps the decimal in experience (regression: "5.5 years" must not parse as 5)', () => {
        expect(parseResumeText('5.5 years of experience').experienceYears).toBe(5.5)
        expect(parseResumeText('10 yrs experience').experienceYears).toBe(10)
        expect(parseResumeText('2.25 years exp').experienceYears).toBe(2.25)
    })

    it('returns an empty (but well-formed) result for blank text', () => {
        const p = parseResumeText('')
        expect(p.textLength).toBe(0)
        expect(p.skills).toEqual([])
        expect(p.email).toBeUndefined()
        expect(p.name).toBeUndefined()
        expect(p.confidence).toEqual({})
    })

    it('matches skills on word boundaries, case-insensitively, without false positives', () => {
        const p = parseResumeText('Proficient in react, GO and rusty tooling. Also reactivity frameworks.')
        expect(p.skills).toContain('React')
        expect(p.skills).toContain('Go')
        // "rusty" / "reactivity" must NOT match the Rust / React dictionary entries
        expect(p.skills).not.toContain('Rust')
    })

    it('does not pick an email/section line as the candidate name', () => {
        const p = parseResumeText('CURRICULUM VITAE\ncontact@acme.io\nMaria Garcia\nObjective: ...')
        expect(p.name).toBe('Maria Garcia')
    })

    it('does not overwrite via confidence — every detected field carries a score', () => {
        const p = parseResumeText(FULL)
        expect(p.confidence.email).toBeGreaterThan(0)
        expect(p.confidence.skills).toBeGreaterThan(0)
        expect(p.confidence.experienceYears).toBeGreaterThan(0)
    })

    it('always returns experience/education arrays (empty when no sections)', () => {
        const p = parseResumeText(FULL)
        expect(Array.isArray(p.experience)).toBe(true)
        expect(Array.isArray(p.education)).toBe(true)
        expect(parseResumeText('').experience).toEqual([])
        expect(parseResumeText('').education).toEqual([])
    })
})

const SECTIONED = `John Doe
Software Engineer
john@example.com

EXPERIENCE
Senior Engineer — Acme Corp
Jan 2020 - Present
• Built the core platform
• Led a team of 5

Junior Engineer, Beta LLC
Jun 2017 – Dec 2019
• Shipped features

EDUCATION
B.Sc in Computer Science — Stanford University
2013 - 2017

SKILLS
React, Node.js
`

describe('parseResumeText — experience & education sections', () => {
    it('parses work history with title, company, dates and current flag', () => {
        const p = parseResumeText(SECTIONED)
        expect(p.experience.length).toBeGreaterThanOrEqual(2)
        const senior = p.experience[0]
        expect(senior.title).toBe('Senior Engineer')
        expect(senior.company).toBe('Acme Corp')
        expect(senior.startDate).toBe('2020-01')
        expect(senior.current).toBe(true)
        const junior = p.experience[1]
        expect(junior.title).toBe('Junior Engineer')
        expect(junior.company).toBe('Beta LLC')
        expect(junior.endDate).toBe('2019-12')
        expect(junior.current).toBe(false)
    })

    it('parses education with the school and degree', () => {
        const p = parseResumeText(SECTIONED)
        expect(p.education.length).toBeGreaterThanOrEqual(1)
        expect(p.education[0].school).toContain('Stanford University')
        expect(p.education[0].degree?.toLowerCase()).toContain('sc')
    })

    it('derives years-of-experience from the work-history span when not stated', () => {
        const p = parseResumeText(SECTIONED)   // no "N years" phrase present
        expect(p.experienceYears).toBeGreaterThan(0)
    })

    it('does not crash on a résumé with headers but no parseable entries', () => {
        const p = parseResumeText('EXPERIENCE\n(see attached)\nEDUCATION\nvarious')
        expect(Array.isArray(p.experience)).toBe(true)
        expect(Array.isArray(p.education)).toBe(true)
    })
})
