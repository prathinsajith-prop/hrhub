import { eq, ne, ilike, not, gte, lte, gt, lt, inArray, notInArray, isNull, isNotNull, and, type SQL } from 'drizzle-orm'
import type { AnyColumn } from 'drizzle-orm'

export interface ParsedFilter {
    field: string
    operator: string
    rawValue: string
    value: string | string[] | number | number[] | null
}

export function parseFilterString(filterStr: string): ParsedFilter[] {
    if (!filterStr) return []
    return filterStr
        .split(';')
        .map(seg => parseSegment(seg.trim()))
        .filter((f): f is ParsedFilter => f !== null)
}

function parseSegment(segment: string): ParsedFilter | null {
    const match = segment.match(/^([^:]+):([A-Z_]+)\(([^)]*)\)$/)
    if (!match) return null
    const [, field, operator, rawValue] = match
    return { field: field!, operator: operator!, rawValue: rawValue!, value: coerceValue(operator!, rawValue!) }
}

function coerceValue(operator: string, raw: string): ParsedFilter['value'] {
    if (operator === 'IS_NULL' || operator === 'IS_NOT_NULL') return null
    if (operator === 'IN' || operator === 'NOT_IN') return raw.split(',').map(v => v.trim())
    if (operator === 'BETWEEN') {
        const parts = raw.split(',').map(v => v.trim())
        const nums = parts.map(Number)
        return nums.every(n => !isNaN(n)) ? nums : parts
    }
    const num = Number(raw)
    if (!isNaN(num) && raw !== '') return num
    return raw
}

export type FieldMap = Record<string, AnyColumn>

export function buildDrizzleFilters(
    parsed: ParsedFilter[],
    fieldMap: FieldMap,
    allowedFields: Set<string>,
): SQL[] {
    const conditions: SQL[] = []
    for (const f of parsed) {
        if (!allowedFields.has(f.field)) continue
        const col = fieldMap[f.field]
        if (!col) continue
        const cond = toSQL(f.operator, col, f.value)
        if (cond) conditions.push(cond)
    }
    return conditions
}

function toSQL(op: string, col: AnyColumn, value: ParsedFilter['value']): SQL | null {
    switch (op) {
        case 'EQ': return value === null ? isNull(col) : eq(col, value as never)
        case 'NEQ': return value === null ? isNotNull(col) : ne(col, value as never)
        case 'LIKE': return ilike(col, `%${value}%`)
        case 'NOT_LIKE': return not(ilike(col, `%${value}%`))
        case 'STARTS_WITH': return ilike(col, `${value}%`)
        case 'ENDS_WITH': return ilike(col, `%${value}`)
        case 'GT': return gt(col, value as never)
        case 'LT': return lt(col, value as never)
        case 'GTE': return gte(col, value as never)
        case 'LTE': return lte(col, value as never)
        case 'IN': return inArray(col, value as string[])
        case 'NOT_IN': return notInArray(col, value as string[])
        case 'BETWEEN': {
            const arr = value as (string | number)[]
            if (!arr || arr.length < 2) return null
            return and(gte(col, arr[0] as never), lte(col, arr[1] as never)) ?? null
        }
        case 'DATE_EQ': return eq(col, value as never)
        case 'DATE_LT': return lt(col, value as never)
        case 'DATE_GT': return gt(col, value as never)
        case 'IS_NULL': return isNull(col)
        case 'IS_NOT_NULL': return isNotNull(col)
        default: return eq(col, value as never)
    }
}
