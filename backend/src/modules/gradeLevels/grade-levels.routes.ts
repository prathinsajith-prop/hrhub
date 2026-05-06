import { z } from 'zod'
import { eq, and, asc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { gradeLevels } from '../../db/schema/index.js'
import { recordActivity } from '../audit/audit.service.js'
import { parseUuidParam } from '../../lib/validation.js'

const HIERARCHIES = ['Entry', 'Junior', 'Mid', 'Senior', 'Lead', 'Manager', 'Leadership'] as const
type Hierarchy = typeof HIERARCHIES[number]

const salaryRefinement = (d: { salaryMin?: number | null; salaryMax?: number | null }) => {
    if (d.salaryMin != null && d.salaryMax != null) return d.salaryMin < d.salaryMax
    return true
}

const createSchema = z.object({
    name: z.string().min(1).max(80),
    code: z.string().min(1).max(10).optional(),
    level: z.number().int().min(1).max(100).optional(),
    hierarchy: z.enum(HIERARCHIES).optional(),
    salaryMin: z.number().int().min(0).optional(),
    salaryMax: z.number().int().min(0).optional(),
    description: z.string().max(500).optional(),
    sortOrder: z.number().int().optional(),
}).refine(salaryRefinement, { message: 'Salary minimum must be less than maximum', path: ['salaryMin'] })

const updateSchema = z.object({
    name: z.string().min(1).max(80).optional(),
    code: z.string().min(1).max(10).nullable().optional(),
    level: z.number().int().min(1).max(100).nullable().optional(),
    hierarchy: z.enum(HIERARCHIES).nullable().optional(),
    salaryMin: z.number().int().min(0).nullable().optional(),
    salaryMax: z.number().int().min(0).nullable().optional(),
    description: z.string().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
}).refine(salaryRefinement, { message: 'Salary minimum must be less than maximum', path: ['salaryMin'] })

// G1-G15 defaults for seed
const DEFAULT_GRADES: Array<{
    name: string; code: string; level: number; hierarchy: Hierarchy;
    salaryMin: number; salaryMax: number; description: string; sortOrder: number
}> = [
        { name: 'Entry Level 1', code: 'G1', level: 1, hierarchy: 'Entry', salaryMin: 3000, salaryMax: 6000, description: 'Foundation role — learning fundamentals under close supervision.', sortOrder: 1 },
        { name: 'Entry Level 2', code: 'G2', level: 2, hierarchy: 'Entry', salaryMin: 4000, salaryMax: 8000, description: 'Building core skills with increasing autonomy on defined tasks.', sortOrder: 2 },
        { name: 'Entry Level 3', code: 'G3', level: 3, hierarchy: 'Entry', salaryMin: 5000, salaryMax: 10000, description: 'Executing standard tasks independently within the team.', sortOrder: 3 },
        { name: 'Junior Level 1', code: 'G4', level: 4, hierarchy: 'Junior', salaryMin: 7000, salaryMax: 12000, description: 'Contributing to team deliverables with moderate guidance.', sortOrder: 4 },
        { name: 'Junior Level 2', code: 'G5', level: 5, hierarchy: 'Junior', salaryMin: 9000, salaryMax: 15000, description: 'Delivering features end-to-end with minimal supervision.', sortOrder: 5 },
        { name: 'Mid Level 1', code: 'G6', level: 6, hierarchy: 'Mid', salaryMin: 12000, salaryMax: 18000, description: 'Owning modules, mentoring juniors, driving quality.', sortOrder: 6 },
        { name: 'Mid Level 2', code: 'G7', level: 7, hierarchy: 'Mid', salaryMin: 15000, salaryMax: 22000, description: 'Subject-matter expert in one domain, improving team processes.', sortOrder: 7 },
        { name: 'Senior Level 1', code: 'G8', level: 8, hierarchy: 'Senior', salaryMin: 18000, salaryMax: 28000, description: 'Leading complex projects, cross-functional collaboration.', sortOrder: 8 },
        { name: 'Senior Level 2', code: 'G9', level: 9, hierarchy: 'Senior', salaryMin: 22000, salaryMax: 35000, description: 'Setting technical direction for a product area.', sortOrder: 9 },
        { name: 'Lead Level 1', code: 'G10', level: 10, hierarchy: 'Lead', salaryMin: 28000, salaryMax: 45000, description: 'Technical lead for a team, accountable for delivery and quality.', sortOrder: 10 },
        { name: 'Lead Level 2', code: 'G11', level: 11, hierarchy: 'Lead', salaryMin: 35000, salaryMax: 55000, description: 'Principal contributor driving architecture across multiple teams.', sortOrder: 11 },
        { name: 'Manager Level 1', code: 'G12', level: 12, hierarchy: 'Manager', salaryMin: 40000, salaryMax: 65000, description: 'People manager owning team performance and hiring.', sortOrder: 12 },
        { name: 'Manager Level 2', code: 'G13', level: 13, hierarchy: 'Manager', salaryMin: 50000, salaryMax: 80000, description: 'Senior manager responsible for a function or department.', sortOrder: 13 },
        { name: 'Director', code: 'G14', level: 14, hierarchy: 'Leadership', salaryMin: 60000, salaryMax: 100000, description: 'Director-level leader with P&L ownership and strategic accountability.', sortOrder: 14 },
        { name: 'VP / C-Level', code: 'G15', level: 15, hierarchy: 'Leadership', salaryMin: 80000, salaryMax: 150000, description: 'Executive leadership setting company-wide direction.', sortOrder: 15 },
    ]

export async function gradeLevelsRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/grade-levels — active grades (any authenticated user)
    fastify.get('/grade-levels', { ...auth, schema: { tags: ['Grade Levels'] } }, async (req: any, reply: any) => {
        const rows = await db
            .select()
            .from(gradeLevels)
            .where(and(eq(gradeLevels.tenantId, req.user.tenantId), eq(gradeLevels.isActive, true)))
            .orderBy(asc(gradeLevels.sortOrder), asc(gradeLevels.name))
        return reply.send({ data: rows })
    })

    // GET /api/v1/grade-levels/all — all grades incl. inactive (hr_manager+)
    fastify.get('/grade-levels/all', { ...adminAuth, schema: { tags: ['Grade Levels'] } }, async (req: any, reply: any) => {
        const rows = await db
            .select()
            .from(gradeLevels)
            .where(eq(gradeLevels.tenantId, req.user.tenantId))
            .orderBy(asc(gradeLevels.sortOrder), asc(gradeLevels.name))
        return reply.send({ data: rows })
    })

    // POST /api/v1/grade-levels/seed-defaults — loads G1-G15 when tenant has none
    fastify.post('/grade-levels/seed-defaults', { ...adminAuth, schema: { tags: ['Grade Levels'] } }, async (req: any, reply: any) => {
        const existing = await db
            .select({ id: gradeLevels.id })
            .from(gradeLevels)
            .where(eq(gradeLevels.tenantId, req.user.tenantId))
            .limit(1)
        if (existing.length > 0) {
            return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Grade levels already exist. Edit or remove them individually.' })
        }
        const rows = await db.insert(gradeLevels)
            .values(DEFAULT_GRADES.map(g => ({ ...g, tenantId: req.user.tenantId })))
            .returning()
        return reply.code(201).send({ data: rows, message: `${rows.length} default grade levels created.` })
    })

    // POST /api/v1/grade-levels
    fastify.post('/grade-levels', { ...adminAuth, schema: { tags: ['Grade Levels'] } }, async (req: any, reply: any) => {
        const parsed = createSchema.safeParse(req.body)
        if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues[0]?.message ?? 'Invalid input' })
        const d = parsed.data
        const [row] = await db.insert(gradeLevels).values({
            tenantId: req.user.tenantId,
            name: d.name.trim(),
            code: d.code?.trim() ?? null,
            level: d.level ?? null,
            hierarchy: d.hierarchy ?? null,
            salaryMin: d.salaryMin ?? null,
            salaryMax: d.salaryMax ?? null,
            description: d.description?.trim() ?? null,
            sortOrder: d.sortOrder ?? (d.level ?? 0),
        }).returning()
        recordActivity({ tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role, entityType: 'grade_level', entityId: row.id, entityName: row.name, action: 'create', ipAddress: req.ip, userAgent: req.headers['user-agent'] }).catch(() => { })
        return reply.code(201).send({ data: row })
    })

    // PATCH /api/v1/grade-levels/:id
    fastify.patch('/grade-levels/:id', { ...adminAuth, schema: { tags: ['Grade Levels'] } }, async (req: any, reply: any) => {
        const id = parseUuidParam(req.params, 'id', reply)
        if (!id) return
        const parsed = updateSchema.safeParse(req.body)
        if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues[0]?.message ?? 'Invalid input' })
        const d = parsed.data
        const patch: Partial<typeof gradeLevels.$inferInsert> = {}
        if (d.name !== undefined) patch.name = d.name!.trim()
        if (d.code !== undefined) patch.code = d.code?.trim() ?? null
        if (d.level !== undefined) patch.level = d.level ?? null
        if (d.hierarchy !== undefined) patch.hierarchy = d.hierarchy ?? null
        if (d.salaryMin !== undefined) patch.salaryMin = d.salaryMin ?? null
        if (d.salaryMax !== undefined) patch.salaryMax = d.salaryMax ?? null
        if (d.description !== undefined) patch.description = d.description?.trim() ?? null
        if (d.isActive !== undefined) patch.isActive = d.isActive
        if (d.sortOrder !== undefined) patch.sortOrder = d.sortOrder
        const [row] = await db.update(gradeLevels).set(patch)
            .where(and(eq(gradeLevels.id, id), eq(gradeLevels.tenantId, req.user.tenantId)))
            .returning()
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Grade level not found' })
        recordActivity({ tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role, entityType: 'grade_level', entityId: row.id, entityName: row.name, action: 'update', ipAddress: req.ip, userAgent: req.headers['user-agent'] }).catch(() => { })
        return reply.send({ data: row })
    })

    // DELETE /api/v1/grade-levels/:id — soft delete
    fastify.delete('/grade-levels/:id', { ...adminAuth, schema: { tags: ['Grade Levels'] } }, async (req: any, reply: any) => {
        const id = parseUuidParam(req.params, 'id', reply)
        if (!id) return
        const [row] = await db.update(gradeLevels).set({ isActive: false })
            .where(and(eq(gradeLevels.id, id), eq(gradeLevels.tenantId, req.user.tenantId)))
            .returning({ id: gradeLevels.id, name: gradeLevels.name })
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Grade level not found' })
        recordActivity({ tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role, entityType: 'grade_level', entityId: row.id, entityName: row.name, action: 'delete', ipAddress: req.ip, userAgent: req.headers['user-agent'] }).catch(() => { })
        return reply.code(204).send()
    })
}
