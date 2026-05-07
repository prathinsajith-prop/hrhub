/**
 * Super-admin-only database diagnostics routes.
 * Exposes pg_stat_statements, cache hit ratios, index usage, and table sizes
 * so a DBA/admin can identify slow queries and missing indexes without needing
 * direct psql access.
 *
 * All routes require: authenticated + super_admin role.
 */
import { sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { extractRows } from '../../lib/db-helpers.js'
import { getConnectionStats } from '../../lib/ws-registry.js'

export async function diagnosticsRoutes(fastify: any) {
    const superAdmin = { preHandler: [fastify.authenticate, fastify.requireRole('super_admin')] }

    /**
     * GET /api/v1/admin/diagnostics/ws-stats
     * Live WebSocket connection counts — useful for capacity planning.
     */
    fastify.get('/ws-stats', superAdmin, async (_req, reply) => {
        return reply.send(getConnectionStats())
    })

    /**
     * GET /api/v1/admin/diagnostics/slow-queries
     * Top 25 slowest queries by mean execution time from pg_stat_statements.
     * Requires the pg_stat_statements extension to be enabled on the server.
     */
    fastify.get('/slow-queries', superAdmin, async (_req, reply) => {
        try {
            const result = await db.execute(sql`
                SELECT
                    LEFT(query, 200)          AS query_preview,
                    calls,
                    ROUND(mean_exec_time::numeric, 2)  AS mean_ms,
                    ROUND(total_exec_time::numeric, 2) AS total_ms,
                    ROUND(stddev_exec_time::numeric, 2) AS stddev_ms,
                    rows,
                    shared_blks_hit,
                    shared_blks_read,
                    CASE
                        WHEN (shared_blks_hit + shared_blks_read) = 0 THEN NULL
                        ELSE ROUND(
                            100.0 * shared_blks_hit / (shared_blks_hit + shared_blks_read),
                            1
                        )
                    END AS block_cache_hit_pct
                FROM pg_stat_statements
                WHERE query NOT LIKE '%pg_stat_statements%'
                  AND mean_exec_time > 50
                ORDER BY mean_exec_time DESC
                LIMIT 25
            `)
            return reply.send({ queries: extractRows(result) })
        } catch (err: any) {
            if (err?.message?.includes('pg_stat_statements')) {
                return reply.code(503).send({
                    error: 'pg_stat_statements extension not available on this server',
                    hint: 'Run: CREATE EXTENSION IF NOT EXISTS pg_stat_statements',
                })
            }
            throw err
        }
    })

    /**
     * GET /api/v1/admin/diagnostics/cache-hit-ratio
     * PostgreSQL shared-buffer cache hit ratio per table.
     * A ratio below 99% on a hot table indicates it needs more shared_buffers or
     * is doing too many sequential scans.
     */
    fastify.get('/cache-hit-ratio', superAdmin, async (_req, reply) => {
        const result = await db.execute(sql`
            SELECT
                schemaname,
                relname AS table_name,
                heap_blks_read,
                heap_blks_hit,
                CASE
                    WHEN (heap_blks_hit + heap_blks_read) = 0 THEN NULL
                    ELSE ROUND(
                        100.0 * heap_blks_hit / (heap_blks_hit + heap_blks_read),
                        2
                    )
                END AS cache_hit_pct
            FROM pg_statio_user_tables
            WHERE (heap_blks_hit + heap_blks_read) > 0
            ORDER BY (heap_blks_hit + heap_blks_read) DESC
            LIMIT 30
        `)
        const rows = extractRows<{ table_name: string; cache_hit_pct: string | null }>(result)
        const overall = rows.reduce(
            (acc, r) => acc + (r.cache_hit_pct ? parseFloat(r.cache_hit_pct) : 0),
            0,
        ) / (rows.length || 1)
        return reply.send({ overall_avg_pct: Math.round(overall * 10) / 10, tables: rows })
    })

    /**
     * GET /api/v1/admin/diagnostics/index-usage
     * Index scan counts vs sequential scans per table.
     * Tables with high seq_scan counts and low idx_scan counts are missing an index.
     */
    fastify.get('/index-usage', superAdmin, async (_req, reply) => {
        const result = await db.execute(sql`
            SELECT
                schemaname,
                relname        AS table_name,
                seq_scan,
                seq_tup_read,
                idx_scan,
                idx_tup_fetch,
                n_live_tup,
                CASE
                    WHEN (seq_scan + COALESCE(idx_scan, 0)) = 0 THEN NULL
                    ELSE ROUND(
                        100.0 * COALESCE(idx_scan, 0) / (seq_scan + COALESCE(idx_scan, 0)),
                        1
                    )
                END AS index_usage_pct
            FROM pg_stat_user_tables
            WHERE n_live_tup > 1000
            ORDER BY seq_scan DESC
            LIMIT 30
        `)
        return reply.send({ tables: extractRows(result) })
    })

    /**
     * GET /api/v1/admin/diagnostics/unused-indexes
     * Indexes that have never been scanned — candidates for removal to reduce
     * write amplification. Excludes unique/PK constraints.
     */
    fastify.get('/unused-indexes', superAdmin, async (_req, reply) => {
        const result = await db.execute(sql`
            SELECT
                schemaname,
                relname      AS table_name,
                indexrelname AS index_name,
                idx_scan,
                pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
            FROM pg_stat_user_indexes
            JOIN pg_index USING (indexrelid)
            WHERE idx_scan = 0
              AND NOT indisunique
              AND NOT indisprimary
            ORDER BY pg_relation_size(indexrelid) DESC
            LIMIT 30
        `)
        return reply.send({ unused_indexes: extractRows(result) })
    })

    /**
     * GET /api/v1/admin/diagnostics/table-sizes
     * Table and index sizes. Useful for spotting runaway tables (e.g. activity_logs).
     */
    fastify.get('/table-sizes', superAdmin, async (_req, reply) => {
        const result = await db.execute(sql`
            SELECT
                relname                                        AS table_name,
                pg_size_pretty(pg_total_relation_size(oid))    AS total_size,
                pg_size_pretty(pg_relation_size(oid))          AS table_size,
                pg_size_pretty(pg_indexes_size(oid))           AS indexes_size,
                pg_total_relation_size(oid)                    AS total_bytes
            FROM pg_class
            JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
            WHERE relkind = 'r'
              AND nspname NOT IN ('pg_catalog', 'information_schema')
            ORDER BY pg_total_relation_size(oid) DESC
            LIMIT 30
        `)
        return reply.send({ tables: extractRows(result) })
    })

    /**
     * GET /api/v1/admin/diagnostics/vacuum-stats
     * Autovacuum health: last vacuum/analyze times and dead tuple counts.
     * High n_dead_tup on a busy table means autovacuum isn't keeping up.
     */
    fastify.get('/vacuum-stats', superAdmin, async (_req, reply) => {
        const result = await db.execute(sql`
            SELECT
                schemaname,
                relname               AS table_name,
                n_live_tup,
                n_dead_tup,
                ROUND(100.0 * n_dead_tup / GREATEST(n_live_tup + n_dead_tup, 1), 1) AS dead_pct,
                last_vacuum,
                last_autovacuum,
                last_analyze,
                last_autoanalyze,
                vacuum_count,
                autovacuum_count
            FROM pg_stat_user_tables
            ORDER BY n_dead_tup DESC
            LIMIT 30
        `)
        return reply.send({ tables: extractRows(result) })
    })
}
