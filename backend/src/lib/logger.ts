/**
 * Shared structured logger for workers and services that run outside the Fastify
 * request lifecycle (where app.log / request.log are unavailable).
 *
 * Matches pino's call signatures:
 *   log.info('message')
 *   log.info({ key: val }, 'message')
 *
 * Writes JSON lines to stdout/stderr — compatible with log aggregators.
 * Route handlers should use request.log or app.log (carries request-id automatically).
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const
type Level = keyof typeof LEVELS
type Meta = Record<string, unknown>

const configured = (process.env.LOG_LEVEL ?? 'info') as Level
const minLevel: number = LEVELS[configured] ?? LEVELS.info

function write(level: Level, metaOrMsg: Meta | string, msg?: string) {
    if (LEVELS[level] < minLevel) return
    const [message, meta] =
        typeof metaOrMsg === 'string'
            ? [metaOrMsg, undefined]
            : [msg ?? '', metaOrMsg]
    const entry = JSON.stringify({ level, time: new Date().toISOString(), msg: message, ...meta })
    if (level === 'error' || level === 'warn') {
        process.stderr.write(entry + '\n')
    } else {
        process.stdout.write(entry + '\n')
    }
}

export const log = {
    debug: (metaOrMsg: Meta | string, msg?: string) => write('debug', metaOrMsg, msg),
    info:  (metaOrMsg: Meta | string, msg?: string) => write('info',  metaOrMsg, msg),
    warn:  (metaOrMsg: Meta | string, msg?: string) => write('warn',  metaOrMsg, msg),
    error: (metaOrMsg: Meta | string, msg?: string) => write('error', metaOrMsg, msg),
}
