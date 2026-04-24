/**
 * Employees repository — owns all Drizzle queries that read or mutate the
 * employees table. Service code should depend on these functions, never on
 * `db.select().from(employees)` directly.
 */
import { and, desc, eq, ilike, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { employees } from '../db/schema/employees.js'
import {
    applyKeyset,
    buildKeysetResult,
    conjunction,
    notDeleted,
    pageOffset,
    type KeysetParams,
    type KeysetResult,
} from '../lib/query-helpers.js'

export interface ListEmployeesOpts extends KeysetParams {
    /** Free-text search across name / email / employee_no. */
    search?: string
    department?: string
    status?: string
    /** Set to false to include archived employees (default true). */
    activeOnly?: boolean
    /** When provided, switches to traditional offset pagination. */
    page?: number
}

/** Find a single employee by id, scoped to tenant. */
export async function findById(tenantId: string, id: string) {
    const [row] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, id)))
        .limit(1)
    return row ?? null
}

/** Paginated list of employees with the standard filters used by the UI. */
export async function listEmployees(tenantId: string, opts: ListEmployeesOpts = {}): Promise<KeysetResult<typeof employees.$inferSelect> & { total?: number }> {
    const activeOnly = opts.activeOnly ?? true

    const predicate = conjunction([
        eq(employees.tenantId, tenantId),
        activeOnly ? eq(employees.isArchived, false) : undefined,
        opts.department ? eq(employees.department, opts.department) : undefined,
        opts.status ? eq(employees.status, opts.status as never) : undefined,
        opts.search
            ? sql`(
                ${employees.firstName} ILIKE ${'%' + opts.search + '%'}
                OR ${employees.lastName} ILIKE ${'%' + opts.search + '%'}
                OR ${employees.email} ILIKE ${'%' + opts.search + '%'}
                OR ${employees.employeeNo} ILIKE ${'%' + opts.search + '%'}
              )`
            : undefined,
    ])

    // Offset pagination — used by tables that show numbered pages.
    if (opts.page) {
        const { limit, offset } = pageOffset(opts)
        const [items, totalRow] = await Promise.all([
            db.select().from(employees).where(predicate!).orderBy(desc(employees.createdAt)).limit(limit).offset(offset),
            db.select({ count: sql<number>`count(*)::int` }).from(employees).where(predicate!),
        ])
        return { items, nextCursor: null, total: totalRow[0]?.count ?? 0 }
    }

    // Keyset pagination — used by virtualised lists and feeds.
    const { limit, cursorPredicate } = applyKeyset(opts, employees.createdAt, employees.id)
    const finalPredicate = cursorPredicate ? and(predicate!, cursorPredicate) : predicate!
    const rows = await db
        .select()
        .from(employees)
        .where(finalPredicate)
        .orderBy(desc(employees.createdAt), desc(employees.id))
        .limit(limit + 1)
    return buildKeysetResult(rows, limit, (r) => [r.createdAt as Date, r.id])
}

/** All direct reports of a manager, scoped to tenant. */
export async function listDirectReports(tenantId: string, managerId: string) {
    return db
        .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            employeeNo: employees.employeeNo,
            department: employees.department,
            designation: employees.designation,
            avatarUrl: employees.avatarUrl,
        })
        .from(employees)
        .where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.reportingTo, managerId),
            eq(employees.isArchived, false),
        ))
        .orderBy(employees.firstName)
}

// Helper kept around in case future repos want fuzzy lookups by display name.
export function nameLike(term: string) {
    return ilike(employees.firstName, `%${term}%`)
}
