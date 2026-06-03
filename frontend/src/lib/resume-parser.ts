/**
 * Client-side résumé parser (heuristic, no AI, no backend).
 *
 * Extracts text from a résumé file (PDF / DOCX / TXT / RTF) entirely in the
 * browser, then pulls structured candidate fields via regex + a skills
 * dictionary. Used to pre-fill apply/candidate forms — values are always
 * editable, and every field carries a 0–1 confidence score so the UI can flag
 * low-confidence guesses. Heavy parsers (pdfjs/mammoth) are dynamically
 * imported so they don't bloat the initial bundle.
 */

/** One past role parsed from the résumé's experience section. Shape matches the
 *  ExperienceEntry the candidate forms persist (dates are YYYY-MM). */
export interface ParsedExperience {
    title: string
    company?: string
    industry?: string
    summary?: string
    startDate?: string
    endDate?: string
    current?: boolean
}

/** One school parsed from the education section. Shape matches EducationEntry. */
export interface ParsedEducation {
    school: string
    degree?: string
    fieldOfStudy?: string
    startDate?: string
    endDate?: string
    current?: boolean
    summary?: string
}

export interface ParsedResume {
    name?: string
    email?: string
    phone?: string
    linkedin?: string
    github?: string
    portfolio?: string
    /** A location line found near the contact block (e.g. "Dubai, United Arab Emirates"). */
    address?: string
    /** Nationality / citizenship if stated explicitly (e.g. "Nationality: Indian"). */
    nationality?: string
    skills: string[]
    experienceYears?: number
    /** Structured work history parsed from the EXPERIENCE section. */
    experience: ParsedExperience[]
    /** Structured schooling parsed from the EDUCATION section. */
    education: ParsedEducation[]
    /** 0–1 confidence per field key (email, phone, name, skills, …). */
    confidence: Record<string, number>
    /** Length of extracted text — 0 means extraction failed (e.g. scanned PDF). */
    textLength: number
}

const SKILL_DICTIONARY = [
    // languages
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'C++', 'Go', 'Rust', 'PHP', 'Ruby', 'Kotlin', 'Swift', 'Scala', 'Dart',
    // frontend
    'React', 'Next.js', 'Vue', 'Angular', 'Svelte', 'Tailwind', 'Redux', 'HTML', 'CSS', 'SASS',
    // backend
    'Node.js', 'Express', 'NestJS', 'Fastify', 'Django', 'Flask', 'Laravel', 'Spring', 'Spring Boot', '.NET', 'Rails',
    // data
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'Oracle', 'Elasticsearch', 'DynamoDB', 'GraphQL', 'Prisma', 'Drizzle',
    // cloud / devops
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Jenkins', 'GitHub Actions', 'CI/CD', 'Nginx', 'Linux',
    // misc
    'Git', 'REST', 'gRPC', 'Kafka', 'RabbitMQ', 'Figma', 'Jira', 'Agile', 'Scrum', 'Jest', 'Playwright', 'Cypress',
]

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/
const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?/i
const GITHUB_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+\/?/i
const URL_RE = /\bhttps?:\/\/[^\s)]+/i
const EXPERIENCE_RE = /(\d{1,2}(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)?/i

// PDF text items in pdfjs are returned in reading order with positional metadata
// but NO inherent newlines. We reconstruct line breaks from the transform matrix
// (item[5] = y-position) and the `hasEOL` flag where pdfjs sets it. Without this,
// the entire page collapses into one line and section detection fails.
type PdfTextItem = { str?: string; hasEOL?: boolean; transform?: number[] }

/** Extract plain text from a résumé file. Returns '' if it can't (e.g. scanned image PDF). */
export async function extractResumeText(file: File): Promise<string> {
    const name = file.name.toLowerCase()
    try {
        if (name.endsWith('.pdf')) {
            const pdfjs = await import('pdfjs-dist')
            const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
            pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
            const data = new Uint8Array(await file.arrayBuffer())
            const doc = await pdfjs.getDocument({ data }).promise
            let text = ''
            for (let i = 1; i <= doc.numPages; i++) {
                const page = await doc.getPage(i)
                const content = await page.getTextContent()
                text += pdfItemsToText(content.items as PdfTextItem[]) + '\n'
            }
            return text
        }
        if (name.endsWith('.docx')) {
            // Browser build of mammoth; no types on the subpath.
            const mammoth = (await import('mammoth/mammoth.browser.js' as string)) as { extractRawText: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> }
            const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
            return value
        }
        // txt / rtf / doc → best-effort plain text
        return await file.text()
    } catch {
        return ''
    }
}

/**
 * Convert pdfjs text items to plain text WITH line breaks.
 * pdfjs gives one TextItem per glyph run; line breaks must be inferred from the
 * y-coordinate (transform[5]) since adjacent runs on the same line share a y.
 * Falls back to the `hasEOL` flag when available (newer pdfjs versions).
 */
function pdfItemsToText(items: PdfTextItem[]): string {
    let out = ''
    let lastY: number | null = null
    for (const it of items) {
        const str = it.str ?? ''
        const y = Array.isArray(it.transform) ? it.transform[5] : null
        // New line if y dropped (PDF y grows upward; reading goes top → bottom).
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 1.5) {
            if (out && !out.endsWith('\n')) out += '\n'
        } else if (str && out && !out.endsWith(' ') && !out.endsWith('\n')) {
            out += ' '
        }
        out += str
        if (it.hasEOL && !out.endsWith('\n')) out += '\n'
        if (y !== null) lastY = y
    }
    return out
}

// ── Section + date helpers (for experience / education extraction) ────────────

const MONTH_MAP: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}
const YEAR = '(?:19|20)\\d{2}'
const MONTHWORD = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?'
// A single date token: "Jan 2020", "01/2020", "2020".
const DATE_TOKEN = `(?:${MONTHWORD}\\s*)?(?:\\d{1,2}[/-])?${YEAR}`
const PRESENT = '(?:present|current|now|ongoing|to\\s*date|till\\s*date|date)'
// A start–end range with various dashes / "to". End may be "Present".
const DATE_RANGE_RE = new RegExp(`(${DATE_TOKEN})\\s*(?:–|—|-|to|until|–|‐|‑|‒|−)\\s*(${PRESENT}|${DATE_TOKEN})`, 'i')
// "Since YYYY" / "From YYYY" → open-ended range.
const SINCE_RE = new RegExp(`(?:since|from)\\s+(${DATE_TOKEN})`, 'i')

// Map a header line to a known section name. Order matters — first match wins.
const SECTION_PATTERNS: Array<{ name: 'experience' | 'education' | 'skills' | 'other'; re: RegExp }> = [
    { name: 'experience', re: /^(?:work\s+|professional\s+|employment\s+|career\s+|relevant\s+|other\s+|previous\s+|all\s+|recent\s+)?(?:experience|work\s+history|employment(?:\s+history)?|career(?:\s+history|\s+summary)?|professional\s+background|professional\s+experience)\b[\s:]*$/i },
    { name: 'education', re: /^(?:education(?:al)?(?:\s+(?:history|background|qualifications?|details?))?|academic(?:s|\s+(?:history|background|qualifications?))?|qualifications?|schooling|studies|scholastics)\b[\s:]*$/i },
    { name: 'skills', re: /^(?:(?:technical|core|key|professional|soft)\s+)?(?:skills?|competenc(?:ies|es)|expertise|proficienc(?:ies|y))\b[\s:]*$/i },
    { name: 'other', re: /^(?:projects?|certifications?|certificates?|summary|profile|objective|about(?:\s+me)?|contact|references?|languages?|interests?|hobbies|awards?|honou?rs?|publications?|volunteer(?:ing)?|activities|achievements?|personal\s+(?:details?|information)|declaration|trainings?|courses?|memberships?)\b[\s:]*$/i },
]

const NATIONALITY_RE = /\b(?:nationality|citizenship|nationalit[éy])\s*[:\-–—]\s*([A-Za-z][A-Za-z -]{2,40})/i
// Address signal words: street types + UAE/GCC cities (primary market) + a few
// regional capitals. Excludes generic words like "building", "tower", "area",
// "zone" that frequently appear in non-address sentences ("building scalable
// apps", "comfort zone"). Address detection is conservative on purpose — false
// positives are visible and annoying to clear.
const ADDRESS_KEYWORD_RE = /\b(street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|lane|p\.?\s*o\.?\s*box|po\s*box|villa|emirates?|united\s+arab\s+emirates|uae|dubai|abu\s*dhabi|sharjah|ajman|fujairah|ras\s*al\s*khaimah|umm\s*al\s*quwain|al\s*ain|riyadh|jeddah|mecca|medina|doha|kuwait\s*city|manama|muscat|amman|beirut|cairo|alexandria)\b/i
// City + Country shape: "Dubai, United Arab Emirates" / "Mumbai, India" / "New York, USA".
const CITY_COUNTRY_RE = /^[A-Z][A-Za-z][A-Za-z .'-]{0,60},\s*[A-Z][A-Za-z][A-Za-z .'-]{1,60}$/

const SCHOOL_RE = /\b(university|college|institute|academy|school|polytechnic|faculty|conservatory|seminary|gymnasium)\b/i
const DEGREE_RE = /\b(bachelor'?s?|master'?s?|doctorate|ph\.?d\.?|d\.?phil\.?|mba|emba|b\.?sc\.?|m\.?sc\.?|b\.?a\.?|m\.?a\.?|b\.?e\.?|m\.?e\.?|b\.?eng\.?|m\.?eng\.?|b\.?tech\.?|m\.?tech\.?|b\.?com\.?|m\.?com\.?|b\.?ed\.?|m\.?ed\.?|llb|llm|bds|mds|md|mbbs|diploma|certificate|associate|hnd|hsc|ssc|high\s+school|secondary\s+school|12th|10th|高中|secondary)\b[^,\n]*/i
const BULLET_RE = /^\s*[•▪◦·∙*‧‣⁃→►●◆-]\s+/

function tokenToYearMonth(tok: string): string | undefined {
    const t = tok.trim().toLowerCase()
    let m = t.match(/(\d{1,2})[/-](\d{4})/)            // MM/YYYY
    if (m) return `${m[2]}-${m[1].padStart(2, '0')}`
    m = t.match(/([a-z]{3,9})\.?\s*((?:19|20)\d{2})/)  // Mon YYYY
    if (m && MONTH_MAP[m[1].slice(0, 3)]) return `${m[2]}-${MONTH_MAP[m[1].slice(0, 3)]}`
    m = t.match(/\b((?:19|20)\d{2})\b/)                // YYYY only → assume Jan (user can refine)
    if (m) return `${m[1]}-01`
    return undefined
}

/**
 * Classify a line as a section header. Returns the section name or null. We
 * accept anything that looks header-like: short (≤80 chars), or ALL-CAPS, or
 * ends with a colon. This is intentionally generous so headers smashed into
 * adjacent text in poorly-extracted PDFs still get recognised.
 */
function classifyHeader(line: string): 'experience' | 'education' | 'skills' | 'other' | null {
    const trimmed = line.trim().replace(/^[•▪◦·*\-\s]+/, '').replace(/[\s:•]+$/, '')
    if (!trimmed) return null
    const looksHeader =
        trimmed.length <= 80 &&
        // Headers don't contain dates, emails, or URLs.
        !DATE_RANGE_RE.test(trimmed) &&
        !EMAIL_RE.test(trimmed) &&
        !URL_RE.test(trimmed)
    if (!looksHeader) return null
    for (const p of SECTION_PATTERNS) {
        if (p.re.test(trimmed)) return p.name
    }
    return null
}

/** Pull the lines belonging to one section (header → next recognised header / end). */
function extractSection(lines: string[], section: 'experience' | 'education'): string[] {
    let start = -1
    for (let i = 0; i < lines.length; i++) {
        if (classifyHeader(lines[i]) === section) { start = i; break }
    }
    if (start === -1) return []
    const block: string[] = []
    for (let i = start + 1; i < lines.length; i++) {
        if (classifyHeader(lines[i])) break   // any recognised section ends the block
        block.push(lines[i])
    }
    return block
}

/** Split an "entry header" into title/company on the first recognised separator. */
function splitTitleCompany(text: string): { title: string; company?: string } {
    const seps = [' — ', ' – ', ' | ', ' · ', ' at ', ' @ ', ', ', ' - ']
    for (const sep of seps) {
        const i = text.indexOf(sep)
        if (i > 0) return { title: text.slice(0, i).trim(), company: text.slice(i + sep.length).trim() || undefined }
    }
    return { title: text.trim() }
}

/** Strong title separators — present in "Senior Engineer — Acme Corp" but not
 *  in "Dubai, United Arab Emirates". Used to score competing header candidates. */
const STRONG_TITLE_SEP_RE = /(\s[—–|·]\s|\sat\s|\s@\s)/i
/** Heuristic words that signal a job-title line (engineer, manager, etc.). */
const JOB_TITLE_HINT_RE = /\b(engineer|developer|designer|manager|director|officer|coordinator|analyst|consultant|specialist|architect|administrator|executive|lead|head|chief|founder|owner|partner|associate|assistant|representative|technician|nurse|doctor|accountant|auditor|teacher|professor|instructor|recruiter|intern|trainee)\b/i

/**
 * Walk back from the date line and combine up to 2 consecutive non-bullet /
 * non-date / non-header lines into a single "Title — Company" header. Pure
 * city-country location lines are filtered out so they don't mask the real
 * title. When two lines are collected, place the one with a job-title keyword
 * first so splitTitleCompany() splits in the right direction.
 */
/** Common company suffixes — used to keep "Engineer, Beta LLC" from looking
 *  like a "City, Country" location pair. */
const COMPANY_SUFFIX_RE = /\b(inc\.?|llc|ltd\.?|corp\.?|corporation|co\.?|company|group|gmbh|s\.?a\.?|s\.?r\.?l\.?|b\.?v\.?|plc|holdings?|enterprises?|industries|technologies|systems|services|solutions|consulting|consultants?|associates?|bank|partners?)\b/i

/** True only for lines that are clearly a "City, Country" location and NOT a
 *  "Title, Company" combo — used to filter out location lines from header
 *  collection while keeping real title+company comma pairs intact. */
function isPureCityCountry(line: string): boolean {
    if (!CITY_COUNTRY_RE.test(line)) return false
    if (JOB_TITLE_HINT_RE.test(line)) return false
    if (COMPANY_SUFFIX_RE.test(line)) return false
    return true
}

function collectAboveHeader(block: string[], i: number): string {
    const aboveCandidates: string[] = []
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const prev = block[j].trim()
        if (!prev) continue
        if (BULLET_RE.test(block[j]) || DATE_RANGE_RE.test(prev) || SINCE_RE.test(prev) || classifyHeader(prev)) break
        // Stop at contact-area lines — they belong to the document header,
        // not to this entry. (Only relevant in the global-fallback pass when
        // section headers were missing.)
        if (EMAIL_RE.test(prev) || URL_RE.test(prev)) break
        if (PHONE_RE.test(prev) && prev.replace(/[^\d+]/g, '').length >= 8) break
        aboveCandidates.push(prev)   // closest first
    }
    const filtered = aboveCandidates.filter(l => !isPureCityCountry(l) && !LABEL_PREFIX_RE.test(l))
    // Reading order (topmost first), then keep the closest 2.
    const ordered = filtered.reverse().slice(-2)
    if (ordered.length === 0) return ''
    if (ordered.length === 1) return ordered[0]
    const [a, b] = ordered
    // If only the closer line (b) has a job-title hint, the layout was
    // "Company\nTitle\nDates" — swap so the title comes first.
    if (JOB_TITLE_HINT_RE.test(b) && !JOB_TITLE_HINT_RE.test(a)) return `${b} — ${a}`
    return `${a} — ${b}`
}

/**
 * Pick whichever candidate looks more like a true "Title — Company" entry header.
 * Date-line content often turns out to be "City, Country | Dates"; the line
 * above is then the real title/company. We use cheap signals (separator, job
 * title keyword, length) to compare.
 */
function pickBetterHeader(inlineHeader: string, aboveHeader: string): string {
    const score = (s: string): number => {
        if (!s || s.length < 2) return -1
        let n = 0
        if (STRONG_TITLE_SEP_RE.test(s)) n += 3
        if (JOB_TITLE_HINT_RE.test(s)) n += 2
        if (s.length >= 12) n += 1
        return n
    }
    const a = score(inlineHeader)
    const b = score(aboveHeader)
    if (b > a) return aboveHeader
    return inlineHeader || aboveHeader
}

interface DatedEntry {
    header: string
    summary?: string
    startDate?: string
    endDate?: string
    current?: boolean
}

/** Date-anchored entry parsing shared by experience + education sections. */
function parseDatedEntries(block: string[]): DatedEntry[] {
    const out: DatedEntry[] = []
    for (let i = 0; i < block.length && out.length < 20; i++) {
        const raw = block[i]
        const line = raw.trim()
        if (!line) continue
        const range = line.match(DATE_RANGE_RE)
        const since = !range ? line.match(SINCE_RE) : null
        if (!range && !since) continue
        let startDate: string | undefined
        let endDate: string | undefined
        let isPresent: boolean
        let matchedSlice: string
        if (range) {
            startDate = tokenToYearMonth(range[1])
            isPresent = new RegExp(`^${PRESENT}$`, 'i').test(range[2].trim())
            endDate = isPresent ? undefined : tokenToYearMonth(range[2])
            matchedSlice = range[0]
        } else {
            startDate = tokenToYearMonth(since![1])
            isPresent = true
            matchedSlice = since![0]
        }
        // Header candidate 1: this line minus the date phrase.
        const inlineHeader = line.replace(matchedSlice, '').replace(/[•|,–—\-(){}\s]+$/g, '').replace(/^[•|,–—\-(){}\s]+/g, '').trim()
        // Header candidate 2: nearest 1–2 non-bullet, non-date lines above —
        // combined into "Title — Company" when both are present (modern résumés
        // commonly put title on one line and company on the next).
        const aboveHeader = collectAboveHeader(block, i)
        // Pick whichever looks more like a real entry header. A "title — company"
        // line scores higher than a plain "City, Country" location line: the
        // separators "—", "–", "|", "·", " at " are distinctive title markers
        // (commas alone are inconclusive — they appear in addresses too).
        const header = pickBetterHeader(inlineHeader, aboveHeader)
        // Summary = following bullet/prose lines until the next dated line.
        // Stop one line before the next date (that line is the next entry's
        // header), AND stop on a non-bullet line whose 2nd-next is a date
        // (catches the "Title\nCompany\nDates" layout that would otherwise eat
        // both lines into the previous summary).
        const sum: string[] = []
        for (let k = i + 1; k < block.length; k++) {
            if (block[k].match(DATE_RANGE_RE) || block[k].match(SINCE_RE)) break
            const next1 = block[k + 1]
            if (next1 && (next1.match(DATE_RANGE_RE) || next1.match(SINCE_RE))) break
            const next2 = block[k + 2]
            if (!BULLET_RE.test(block[k]) && next2 && (next2.match(DATE_RANGE_RE) || next2.match(SINCE_RE))) break
            const s = block[k].trim()
            if (s) sum.push(s.replace(BULLET_RE, '• '))
            if (sum.length > 8) break   // cap summary length
        }
        if (header.length >= 2) {
            out.push({ header, summary: sum.join('\n').slice(0, 800) || undefined, startDate, endDate, current: isPresent })
        }
    }
    return out
}

function parseExperienceBlock(block: string[]): ParsedExperience[] {
    return parseDatedEntries(block).map(e => {
        const { title, company } = splitTitleCompany(e.header)
        return { title: title.slice(0, 120), company: company?.slice(0, 120), summary: e.summary, startDate: e.startDate, endDate: e.endDate, current: e.current }
    }).filter(e => e.title.length >= 2)
}

function parseEducationBlock(block: string[]): ParsedEducation[] {
    const dated = parseDatedEntries(block)
    const fromDates = dated.map(e => mapEducation(e.header, e.summary, e.startDate, e.endDate, e.current)).filter(Boolean) as ParsedEducation[]
    if (fromDates.length) return fromDates
    // No dates — fall back to school-keyword OR degree-keyword lines.
    const out: ParsedEducation[] = []
    for (const raw of block) {
        const line = raw.trim()
        if (!line || out.length >= 15) continue
        if (SCHOOL_RE.test(line) || DEGREE_RE.test(line)) {
            const ed = mapEducation(line)
            if (ed) out.push(ed)
        }
    }
    return out
}

function mapEducation(header: string, summary?: string, startDate?: string, endDate?: string, current?: boolean): ParsedEducation | null {
    // school = the segment with a school keyword; degree/field from a degree phrase.
    const parts = header.split(/\s+(?:—|–|\||·|,|-| at )\s+/).map(p => p.trim()).filter(Boolean)
    const schoolPart = parts.find(p => SCHOOL_RE.test(p))
    const degreePart = parts.find(p => DEGREE_RE.test(p))
    const school = schoolPart ?? parts.find(p => !DEGREE_RE.test(p)) ?? parts[0] ?? header
    const degMatch = (degreePart ?? header).match(DEGREE_RE)
    let degree: string | undefined
    let fieldOfStudy: string | undefined
    if (degMatch) {
        const parsed = splitDegreeAndField(degMatch[0].trim())
        degree = parsed.degree
        fieldOfStudy = parsed.fieldOfStudy
    }
    if (!school || school.length < 2) return null
    return { school: school.slice(0, 160), degree: degree?.slice(0, 80), fieldOfStudy: fieldOfStudy?.slice(0, 120), summary, startDate, endDate, current }
}

/** Generic disciplines that are part of the degree NAME, not the field — used
 *  to keep "Bachelor of Science" intact while still splitting "Bachelor of
 *  Computer Science" into degree + field. */
const GENERIC_DISCIPLINE_RE = /^(science|arts|engineering|commerce|education|laws?|philosophy|medicine|pharmacy|architecture|business|administration|technology|management|theology|divinity|fine\s+arts|liberal\s+arts|applied\s+science|computer\s+applications?)\b/i
/** Compact degree abbreviations — when the full degree text starts with one,
 *  any words after it are the field of study (e.g. "B.Tech Computer Science"). */
const COMPACT_DEGREE_PREFIX_RE = /^(b\.?sc\.?|m\.?sc\.?|b\.?a\.?|m\.?a\.?|b\.?e\.?|m\.?e\.?|b\.?eng\.?|m\.?eng\.?|b\.?tech\.?|m\.?tech\.?|b\.?com\.?|m\.?com\.?|b\.?ed\.?|m\.?ed\.?|llb|llm|bds|mds|md|mbbs|mba|emba|bca|mca|bba|hnd|hsc|ssc)\b/i

const cleanField = (s: string) => s.replace(/[\s,;.]+$/, '').slice(0, 120)

/**
 * Split a degree phrase into degree + field of study.
 *
 * Three strategies, tried in order:
 *   1. " in X" → cleanest split ("Master of Science in Computer Science").
 *   2. " of X" → split only if X is a SPECIFIC field, not a generic discipline
 *      word ("Science" / "Arts" / "Engineering" are part of the degree name).
 *   3. Compact prefix ("B.Tech", "MBA", …) directly followed by a field name
 *      with no separator ("B.Tech Computer Science", "BSc Mathematics").
 */
function splitDegreeAndField(full: string): { degree: string; fieldOfStudy?: string } {
    const inIdx = full.search(/\s+in\s+/i)
    if (inIdx > 0) {
        const before = full.slice(0, inIdx).trim()
        const after = full.slice(inIdx).replace(/^\s+in\s+/i, '').trim()
        if (before.length >= 2 && after.length >= 2) {
            return { degree: before, fieldOfStudy: cleanField(after) }
        }
    }
    const ofIdx = full.search(/\s+of\s+/i)
    if (ofIdx > 0) {
        const before = full.slice(0, ofIdx).trim()
        const after = full.slice(ofIdx).replace(/^\s+of\s+/i, '').trim()
        if (before.length >= 2 && after.length >= 2 && !GENERIC_DISCIPLINE_RE.test(after)) {
            return { degree: before, fieldOfStudy: cleanField(after) }
        }
    }
    const compactMatch = full.match(COMPACT_DEGREE_PREFIX_RE)
    if (compactMatch) {
        const after = full.slice(compactMatch[0].length).replace(/^[\s,-]+/, '').trim()
        if (after.length >= 2 && !DEGREE_RE.test(after)) {
            return { degree: compactMatch[0].trim(), fieldOfStudy: cleanField(after) }
        }
    }
    return { degree: full }
}

/**
 * Global date-range fallback. When section detection misses (smashed PDF text,
 * unusual headers), scan the full document line-by-line for every date range
 * and bucket each entry as education vs. experience based on nearby keywords.
 * Conservative: only used when the structured section parser returns empty.
 */
function fallbackScanEntries(lines: string[]): { experience: ParsedExperience[]; education: ParsedEducation[] } {
    const dated = parseDatedEntries(lines)
    const experience: ParsedExperience[] = []
    const education: ParsedEducation[] = []
    for (const e of dated) {
        // Classify by the entry's header only — the summary may bleed the next
        // entry's header when dated lines aren't separated by blank lines, so
        // including it here would misclassify experience as education and vice-versa.
        const looksEducation = SCHOOL_RE.test(e.header) || DEGREE_RE.test(e.header)
        if (looksEducation) {
            const ed = mapEducation(e.header, e.summary, e.startDate, e.endDate, e.current)
            if (ed) education.push(ed)
        } else {
            const { title, company } = splitTitleCompany(e.header)
            if (title.length >= 2) {
                experience.push({ title: title.slice(0, 120), company: company?.slice(0, 120), summary: e.summary, startDate: e.startDate, endDate: e.endDate, current: e.current })
            }
        }
    }
    return { experience, education }
}

/** Lines that look like labelled prose (`Summary: …`, `Skills: …`) — never an address. */
const LABEL_PREFIX_RE = /^(nationality|citizenship|nationalit[éy]|summary|profile|objective|about(?:\s+me)?|skills?|experience|expertise|languages?|interests?|hobbies|references?|declaration|career\s+objective|key\s+strengths?|achievements?)\s*[:-]/i
/** Explicit prefixes that lead an address line — stripped before returning. */
const ADDRESS_PREFIX_RE = /^(address|location|residence|residing\s+(?:at|in))\s*[:-]\s*/i

/**
 * Find an address line in the résumé's contact area (top of the document).
 * Strategy: scan the first 20 non-empty lines and pick the one that either
 * contains an address keyword (Street, P.O. Box, city name) or matches the
 * "City, Country" shape. Skip lines that are clearly something else
 * (name-only, email, phone, links, "Nationality:", "Summary:", section headers).
 */
function findAddress(lines: string[]): string | undefined {
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        let line = lines[i].trim()
        if (!line || line.length < 4 || line.length > 160) continue
        if (EMAIL_RE.test(line)) continue
        if (URL_RE.test(line)) continue
        if (PHONE_RE.test(line) && line.replace(/[^\d+]/g, '').length >= 8) continue
        if (classifyHeader(line)) continue
        if (DATE_RANGE_RE.test(line) || SINCE_RE.test(line)) continue
        // Labelled prose (Nationality:, Summary:, Skills:, …) belongs to other
        // fields — never treat as address even if a city word appears in it.
        if (LABEL_PREFIX_RE.test(line)) continue
        // Pure "First Last" 2–4 word name → not an address.
        if (/^[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3}$/.test(line) && !/,/.test(line)) continue
        // Strip explicit "Address:" / "Location:" prefix if present.
        line = line.replace(ADDRESS_PREFIX_RE, '')
        const hasKeyword = ADDRESS_KEYWORD_RE.test(line)
        const isCityCountry = CITY_COUNTRY_RE.test(line)
        if (hasKeyword || isCityCountry) {
            return line.replace(/^[•|–—\-\s]+/, '').replace(/[•|–—\-\s]+$/, '').slice(0, 200)
        }
    }
    return undefined
}

/** Heuristic field extraction from résumé text. */
export function parseResumeText(text: string): ParsedResume {
    const out: ParsedResume = { skills: [], experience: [], education: [], confidence: {}, textLength: text.length }
    if (!text.trim()) return out

    const email = text.match(EMAIL_RE)?.[0]
    if (email) { out.email = email; out.confidence.email = 0.97 }

    const phoneRaw = text.match(PHONE_RE)?.[0]?.trim()
    if (phoneRaw) {
        const digits = phoneRaw.replace(/[^\d+]/g, '')
        if (digits.replace(/\D/g, '').length >= 8) { out.phone = digits; out.confidence.phone = 0.9 }
    }

    const linkedin = text.match(LINKEDIN_RE)?.[0]
    if (linkedin) { out.linkedin = linkedin.startsWith('http') ? linkedin : `https://${linkedin}`; out.confidence.linkedin = 0.95 }
    const github = text.match(GITHUB_RE)?.[0]
    if (github) { out.github = github.startsWith('http') ? github : `https://${github}`; out.confidence.github = 0.9 }
    // Portfolio: first http(s) URL that isn't LinkedIn/GitHub. Scan ALL URLs, not
    // just the first — when LinkedIn appears before the portfolio, the old code
    // would skip the portfolio entirely.
    const urls = text.match(/\bhttps?:\/\/[^\s)]+/gi) ?? []
    const portfolio = urls.find(u => !/linkedin|github/i.test(u))
    if (portfolio) { out.portfolio = portfolio; out.confidence.portfolio = 0.6 }

    const exp = text.match(EXPERIENCE_RE)
    if (exp) { out.experienceYears = Number(exp[1]); out.confidence.experienceYears = 0.7 }

    const nat = text.match(NATIONALITY_RE)
    if (nat) {
        const value = nat[1].trim().replace(/[,;.]+$/, '')
        if (value && value.length <= 40 && !/\d|@|http/i.test(value)) {
            out.nationality = value
            out.confidence.nationality = 0.85
        }
    }

    // Name: first non-empty line that looks like a person's name (2–4 words,
    // letters only, no email/digits/section keywords). Résumés almost always
    // lead with the candidate's name.
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const NAME_RE = /^[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3}$/
    const BAD = /resume|curriculum|vitae|profile|summary|objective|contact|address|@|\d|http/i
    for (const line of lines.slice(0, 8)) {
        if (line.length <= 40 && NAME_RE.test(line) && !BAD.test(line)) { out.name = line; out.confidence.name = 0.75; break }
    }

    // Address: scan the contact area (first ~15 lines) for a line that either
    // contains an address keyword (Street / P.O. Box / known UAE city) or has
    // a "City, Country" shape. Skip lines that already match higher-confidence
    // fields (name, email, phone, links) so we don't double-count.
    out.address = findAddress(lines)
    if (out.address) out.confidence.address = ADDRESS_KEYWORD_RE.test(out.address) ? 0.75 : 0.55

    // Skills: dictionary match (word-boundary, case-insensitive).
    const lower = text.toLowerCase()
    const found = SKILL_DICTIONARY.filter(s => {
        const esc = s.toLowerCase().replace(/[.+#]/g, m => `\\${m}`)
        return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(lower)
    })
    if (found.length) { out.skills = found; out.confidence.skills = found.length >= 3 ? 0.85 : 0.6 }

    // Structured experience + education from their sections.
    const expBlock = extractSection(lines, 'experience')
    if (expBlock.length) {
        out.experience = parseExperienceBlock(expBlock)
        if (out.experience.length) out.confidence.experience = 0.7
    }
    const eduBlock = extractSection(lines, 'education')
    if (eduBlock.length) {
        out.education = parseEducationBlock(eduBlock)
        if (out.education.length) out.confidence.education = 0.7
    }

    // Fallback: if neither section yielded entries (likely a poorly-structured
    // résumé or one where headers were never detected), do a global date-range
    // scan and bucket entries by school/degree keywords. Lower confidence.
    if (!out.experience.length && !out.education.length) {
        const fb = fallbackScanEntries(lines)
        if (fb.experience.length) { out.experience = fb.experience; out.confidence.experience = 0.4 }
        if (fb.education.length) { out.education = fb.education; out.confidence.education = 0.4 }
    } else if (!out.experience.length) {
        const fb = fallbackScanEntries(lines)
        if (fb.experience.length) { out.experience = fb.experience; out.confidence.experience = 0.4 }
    } else if (!out.education.length) {
        const fb = fallbackScanEntries(lines)
        if (fb.education.length) { out.education = fb.education; out.confidence.education = 0.4 }
    }

    // If years-of-experience wasn't stated outright, derive it from the work
    // history span (earliest start → latest end / today).
    if (out.experienceYears == null && out.experience.length) {
        const starts = out.experience.map(e => e.startDate).filter(Boolean) as string[]
        const ends = out.experience.map(e => (e.current ? null : e.endDate)).filter(Boolean) as string[]
        if (starts.length) {
            const minStart = starts.sort()[0]
            const hasCurrent = out.experience.some(e => e.current)
            const maxEnd = hasCurrent || !ends.length ? null : ends.sort().at(-1)!
            const startYM = minStart.split('-').map(Number)
            const endYM = maxEnd ? maxEnd.split('-').map(Number) : null
            const now = new Date()
            const months = endYM
                ? (endYM[0] - startYM[0]) * 12 + (endYM[1] - startYM[1])
                : (now.getFullYear() - startYM[0]) * 12 + (now.getMonth() + 1 - startYM[1])
            const years = Math.max(0, Math.round((months / 12) * 10) / 10)
            if (years > 0 && years < 60) { out.experienceYears = years; out.confidence.experienceYears = 0.5 }
        }
    }

    return out
}

/** Extract text from a file and parse it in one call. */
export async function parseResumeFile(file: File): Promise<ParsedResume> {
    return parseResumeText(await extractResumeText(file))
}

/** A candidate image found in a résumé, with its pixel dimensions. */
interface FoundImage { blob: Blob; width: number; height: number }

/**
 * Pick the most "profile-photo-like" image: roughly square-to-portrait
 * (aspect 0.5–1.5), at least 64px on a side, preferring the largest such
 * image. Wide banners and tiny logos are filtered out by the aspect/size gate.
 */
function pickBestPhoto(images: FoundImage[]): Blob | null {
    const candidates = images
        .filter(im => im.width >= 64 && im.height >= 64 && im.width / im.height >= 0.5 && im.width / im.height <= 1.5)
        .sort((a, b) => b.width * b.height - a.width * a.height)
    return candidates[0]?.blob ?? null
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.9))
}

/** Draw a pdfjs image object (ImageBitmap or raw RGB(A) data) to a JPEG blob. */
async function pdfImageToBlob(img: { width: number; height: number; bitmap?: ImageBitmap; data?: Uint8Array | Uint8ClampedArray }): Promise<Blob | null> {
    const { width, height } = img
    if (!width || !height) return null
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    if (img.bitmap) {
        ctx.drawImage(img.bitmap, 0, 0)
    } else if (img.data) {
        const src = img.data
        const rgba = new Uint8ClampedArray(width * height * 4)
        if (src.length === width * height * 4) {
            rgba.set(src)
        } else if (src.length === width * height * 3) {
            for (let i = 0, j = 0; i < src.length; i += 3, j += 4) {
                rgba[j] = src[i]; rgba[j + 1] = src[i + 1]; rgba[j + 2] = src[i + 2]; rgba[j + 3] = 255
            }
        } else if (src.length === width * height) {
            for (let i = 0, j = 0; i < src.length; i++, j += 4) {
                rgba[j] = rgba[j + 1] = rgba[j + 2] = src[i]; rgba[j + 3] = 255
            }
        } else {
            return null
        }
        ctx.putImageData(new ImageData(rgba, width, height), 0, 0)
    } else {
        return null
    }
    return canvasToBlob(canvas)
}

/**
 * Best-effort extraction of a candidate photo embedded in a résumé.
 * PDF: scans the first 2 pages' image XObjects. DOCX: reads embedded media.
 * Returns null for scanned/imageless files — never throws.
 */
export async function extractResumeImage(file: File): Promise<Blob | null> {
    const name = file.name.toLowerCase()
    try {
        if (name.endsWith('.pdf')) {
            const pdfjs = await import('pdfjs-dist')
            const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
            pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
            const data = new Uint8Array(await file.arrayBuffer())
            const doc = await pdfjs.getDocument({ data }).promise
            const found: FoundImage[] = []
            const pages = Math.min(doc.numPages, 2)
            for (let p = 1; p <= pages; p++) {
                const page = await doc.getPage(p)
                const ops = await page.getOperatorList()
                const imageOps = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject])
                for (let i = 0; i < ops.fnArray.length; i++) {
                    if (!imageOps.has(ops.fnArray[i])) continue
                    const imgName = ops.argsArray[i]?.[0]
                    if (typeof imgName !== 'string') continue
                    const obj = await new Promise<any>(resolve => {
                        try { page.objs.get(imgName, resolve) } catch { resolve(null) }
                    })
                    if (!obj) continue
                    const blob = await pdfImageToBlob(obj)
                    if (blob) found.push({ blob, width: obj.width, height: obj.height })
                    if (found.length >= 12) break
                }
                if (found.length >= 12) break
            }
            return pickBestPhoto(found)
        }
        if (name.endsWith('.docx')) {
            const JSZip = (await import('jszip')).default
            const zip = await JSZip.loadAsync(await file.arrayBuffer())
            const media = Object.keys(zip.files).filter(f => /^word\/media\/.+\.(png|jpe?g)$/i.test(f))
            const found: FoundImage[] = []
            for (const path of media.slice(0, 12)) {
                // JSZip blobs have an empty MIME type, which would make the
                // multipart upload arrive as application/octet-stream and get
                // rejected server-side. Stamp the type from the file extension.
                const type = /\.png$/i.test(path) ? 'image/png' : 'image/jpeg'
                const blob = new Blob([await zip.files[path].async('arraybuffer')], { type })
                const dims = await imageDimensions(blob)
                if (dims) found.push({ blob, ...dims })
            }
            return pickBestPhoto(found)
        }
        return null
    } catch {
        return null
    }
}

/** Read a raster image blob's pixel dimensions via an object URL. */
function imageDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
    return new Promise(resolve => {
        const url = URL.createObjectURL(blob)
        const img = new Image()
        img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }) }
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
        img.src = url
    })
}
