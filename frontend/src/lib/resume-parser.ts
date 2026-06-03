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
                text += (content.items as Array<{ str?: string }>).map(it => it.str ?? '').join(' ') + '\n'
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
const DATE_RANGE_RE = new RegExp(`(${DATE_TOKEN})\\s*(?:–|—|-|to)\\s*(${PRESENT}|${DATE_TOKEN})`, 'i')

// Section headers we care about, plus the broad set used only to detect where a
// section ends (a header-like line starting any résumé section).
const EXPERIENCE_HEADER_RE = /^(?:work\s+|professional\s+|employment\s+|career\s+)?(?:experience|work history|employment(?:\s+history)?|career(?:\s+history)?)\s*:?\s*$/i
const EDUCATION_HEADER_RE = /^(?:education|academic(?:s|\s+background)?|qualifications?|educational background)\s*:?\s*$/i
const ANY_HEADER_RE = /^(?:work|professional|employment|career|experience|education|academic|qualifications?|skills?|technical skills|projects?|certifications?|certificates?|summary|profile|objective|about(?:\s+me)?|contact|references?|languages?|interests?|hobbies|awards?|honou?rs?|publications?|volunteer(?:ing)?|activities|achievements?|personal\s+(?:details?|information)|declaration)\b[\s:]*$/i

const SCHOOL_RE = /\b(university|college|institute|academy|school|polytechnic|faculty)\b/i
const DEGREE_RE = /\b(bachelor'?s?|master'?s?|doctorate|ph\.?d|mba|b\.?sc|m\.?sc|b\.?a|m\.?a|b\.?eng|m\.?eng|b\.?tech|m\.?tech|b\.?com|diploma|associate|hnd|高中|secondary)\b[^,\n]*/i
const BULLET_RE = /^\s*[•▪◦·*-]\s+/

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

/** Pull the lines belonging to one section (header → next header / end). */
function extractSection(lines: string[], headerRe: RegExp): string[] {
    const start = lines.findIndex(l => l.trim().length <= 42 && headerRe.test(l.trim()))
    if (start === -1) return []
    const block: string[] = []
    for (let i = start + 1; i < lines.length; i++) {
        const t = lines[i].trim()
        if (t.length <= 42 && ANY_HEADER_RE.test(t)) break   // next section
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

/** Date-anchored entry parsing shared by experience + education sections. */
function parseDatedEntries(block: string[]): Array<{ header: string; summary?: string; startDate?: string; endDate?: string; current?: boolean }> {
    const out: Array<{ header: string; summary?: string; startDate?: string; endDate?: string; current?: boolean }> = []
    const summaryFor: string[][] = []
    for (let i = 0; i < block.length && out.length < 15; i++) {
        const raw = block[i]
        const line = raw.trim()
        if (!line) continue
        const dm = line.match(DATE_RANGE_RE)
        if (!dm) continue
        const startDate = tokenToYearMonth(dm[1])
        const isPresent = new RegExp(`^${PRESENT}$`, 'i').test(dm[2].trim())
        const endDate = isPresent ? undefined : tokenToYearMonth(dm[2])
        // Header = this line minus the date, else the nearest non-bullet line above.
        let header = line.replace(dm[0], '').replace(/[•|,–—\-(){}\s]+$/g, '').replace(/^[•|,–—\-(){}\s]+/g, '').trim()
        if (header.length < 2) {
            for (let j = i - 1; j >= 0 && j >= i - 2; j--) {
                const prev = block[j].trim()
                if (prev && !BULLET_RE.test(block[j]) && !DATE_RANGE_RE.test(prev)) { header = prev; break }
            }
        }
        // Summary = following bullet/prose lines until the next dated line.
        const sum: string[] = []
        for (let k = i + 1; k < block.length; k++) {
            if (block[k].match(DATE_RANGE_RE)) break
            const s = block[k].trim()
            if (s) sum.push(s.replace(BULLET_RE, '• '))
        }
        if (header.length >= 2) {
            out.push({ header, summary: sum.join('\n').slice(0, 800) || undefined, startDate, endDate, current: isPresent })
            summaryFor.push(sum)
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
    if (dated.length) {
        return dated.map(e => mapEducation(e.header, e.summary, e.startDate, e.endDate, e.current)).filter(Boolean) as ParsedEducation[]
    }
    // No dates — fall back to school-keyword lines (each school = one entry).
    const out: ParsedEducation[] = []
    for (const raw of block) {
        const line = raw.trim()
        if (line && SCHOOL_RE.test(line) && out.length < 15) {
            const ed = mapEducation(line)
            if (ed) out.push(ed)
        }
    }
    return out
}

function mapEducation(header: string, summary?: string, startDate?: string, endDate?: string, current?: boolean): ParsedEducation | null {
    // school = the segment with a school keyword; degree/field from a degree phrase.
    const parts = header.split(/\s+(?:—|–|\||·|,|-| at )\s+/).map(p => p.trim()).filter(Boolean)
    const school = parts.find(p => SCHOOL_RE.test(p)) ?? parts[0] ?? header
    const degMatch = header.match(DEGREE_RE)
    let degree: string | undefined
    let fieldOfStudy: string | undefined
    if (degMatch) {
        degree = degMatch[1]
        const field = header.slice(degMatch.index! + degMatch[0].length).match(/(?:in|of)\s+([A-Za-z][A-Za-z &/]+)/i)
        if (field) fieldOfStudy = field[1].trim().replace(/\s+$/, '')
    }
    if (!school || school.length < 2) return null
    return { school: school.slice(0, 160), degree: degree?.slice(0, 80), fieldOfStudy: fieldOfStudy?.slice(0, 120), summary, startDate, endDate, current }
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
    const url = text.match(URL_RE)?.[0]
    if (url && !/linkedin|github/i.test(url)) { out.portfolio = url; out.confidence.portfolio = 0.6 }

    const exp = text.match(EXPERIENCE_RE)
    if (exp) { out.experienceYears = Number(exp[1]); out.confidence.experienceYears = 0.7 }

    // Name: first non-empty line that looks like a person's name (2–4 words,
    // letters only, no email/digits/section keywords). Résumés almost always
    // lead with the candidate's name.
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const NAME_RE = /^[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3}$/
    const BAD = /resume|curriculum|vitae|profile|summary|objective|contact|address|@|\d|http/i
    for (const line of lines.slice(0, 8)) {
        if (line.length <= 40 && NAME_RE.test(line) && !BAD.test(line)) { out.name = line; out.confidence.name = 0.75; break }
    }

    // Skills: dictionary match (word-boundary, case-insensitive).
    const lower = text.toLowerCase()
    const found = SKILL_DICTIONARY.filter(s => {
        const esc = s.toLowerCase().replace(/[.+#]/g, m => `\\${m}`)
        return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(lower)
    })
    if (found.length) { out.skills = found; out.confidence.skills = found.length >= 3 ? 0.85 : 0.6 }

    // Structured experience + education from their sections.
    const expBlock = extractSection(lines, EXPERIENCE_HEADER_RE)
    if (expBlock.length) {
        out.experience = parseExperienceBlock(expBlock)
        if (out.experience.length) out.confidence.experience = 0.6
    }
    const eduBlock = extractSection(lines, EDUCATION_HEADER_RE)
    if (eduBlock.length) {
        out.education = parseEducationBlock(eduBlock)
        if (out.education.length) out.confidence.education = 0.6
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
