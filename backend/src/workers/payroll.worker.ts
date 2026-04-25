/**
 * Payroll BullMQ worker — runs payroll calculations asynchronously.
 * The POST /payroll/:id/run route enqueues a job and returns { jobId } immediately.
 * The worker processes the job in the background and updates the payroll run status.
 */
import { Queue, Worker } from 'bullmq'
import { loadEnv } from '../config/env.js'
import { runPayroll } from '../modules/payroll/payroll.service.js'

export interface PayrollJobData {
    tenantId: string
    payrollRunId: string
}

function getRedisConnection() {
    const env = loadEnv()
    const url = new URL(env.REDIS_URL)
    return {
        host: url.hostname,
        port: Number(url.port ?? 6379),
        password: url.password || undefined,
        enableReadyCheck: false,
        maxRetriesPerRequest: null as null,
    }
}

export const PAYROLL_QUEUE_NAME = 'payroll-run'

let _payrollQueue: Queue<PayrollJobData> | null = null

export function getPayrollQueue(): Queue<PayrollJobData> | null {
    return _payrollQueue
}

export async function enqueuePayrollRun(tenantId: string, payrollRunId: string): Promise<string | null> {
    if (!_payrollQueue) return null
    const job = await _payrollQueue.add('run-payroll', { tenantId, payrollRunId }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
    })
    return job.id ?? null
}

export async function startPayrollWorker(): Promise<void> {
    const env = loadEnv()
    if (!env.REDIS_URL) {
        console.warn('⚠️  REDIS_URL not set — payroll worker disabled')
        return
    }

    // Probe Redis once before wiring BullMQ so we fail fast (instead of looping
    // ECONNREFUSED on every reconnect attempt).
    const { createConnection } = await import('net')
    const reachable = await new Promise<boolean>((resolve) => {
        try {
            const url = new URL(env.REDIS_URL)
            const socket = createConnection({ host: url.hostname, port: Number(url.port ?? 6379) })
            socket.setTimeout(1000)
            socket.on('connect', () => { socket.destroy(); resolve(true) })
            socket.on('error', () => { socket.destroy(); resolve(false) })
            socket.on('timeout', () => { socket.destroy(); resolve(false) })
        } catch {
            resolve(false)
        }
    })
    if (!reachable) {
        console.warn('⚠️  Redis unreachable — payroll worker disabled')
        return
    }

    let connection: ReturnType<typeof getRedisConnection>
    try {
        connection = getRedisConnection()
    } catch {
        console.warn('⚠️  Redis unavailable — payroll worker disabled')
        return
    }

    _payrollQueue = new Queue<PayrollJobData>(PAYROLL_QUEUE_NAME, { connection })

    const worker = new Worker<PayrollJobData>(
        PAYROLL_QUEUE_NAME,
        async (job) => {
            const { tenantId, payrollRunId } = job.data
            console.log(`[payroll-worker] Processing payroll run ${payrollRunId} for tenant ${tenantId}`)
            await runPayroll(tenantId, payrollRunId)
            console.log(`[payroll-worker] Completed payroll run ${payrollRunId}`)
        },
        {
            connection,
            concurrency: 2,
        }
    )

    worker.on('failed', (job, err) => {
        console.error(`[payroll-worker] Job ${job?.id} failed:`, err?.message)
    })

    worker.on('error', (err) => {
        console.error('[payroll-worker] Worker error:', err?.message)
    })

    console.log('[payroll-worker] Worker started')
}
