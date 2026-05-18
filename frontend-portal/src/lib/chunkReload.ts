// Vite splits the app into hashed chunks. After a new deploy, the user's
// already-loaded `index.html` still references the *old* chunk hashes — so
// the next `React.lazy()` import (or `<Link>` navigation that triggers one)
// fails with `Failed to fetch dynamically imported module`. Without recovery
// the user sees an error screen until they manually reload.
//
// This module:
//   1. Detects that failure mode from an Error / event / message.
//   2. Force-reloads the page so the browser fetches the new index.html and
//      the new chunk hashes.
//   3. Guards against infinite reload loops by stamping a sessionStorage key.

const RELOAD_FLAG = 'hrhub.portal.chunkReload.ts'
const RELOAD_GUARD_MS = 30_000

const CHUNK_ERROR_PATTERNS = [
    /Failed to fetch dynamically imported module/i,
    /Importing a module script failed/i,
    /Loading chunk \S+ failed/i,
    /ChunkLoadError/i,
    /error loading dynamically imported module/i,
]

export function isChunkLoadError(err: unknown): boolean {
    if (!err) return false
    const candidate =
        err instanceof Error
            ? `${err.name} ${err.message}`
            : typeof err === 'string'
              ? err
              : (err as { message?: string })?.message ?? ''
    return CHUNK_ERROR_PATTERNS.some((re) => re.test(candidate))
}

/**
 * Reload the page once. Returns true if a reload was triggered; false if a
 * reload was suppressed (we already reloaded recently and the error is still
 * happening — surface the real error instead of looping).
 */
export function tryReloadForChunkError(): boolean {
    try {
        const stamp = Number(sessionStorage.getItem(RELOAD_FLAG) ?? '0')
        if (stamp && Date.now() - stamp < RELOAD_GUARD_MS) return false
        sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
    } catch {
        // sessionStorage can throw in private mode / sandboxed iframes —
        // fall through to reloading anyway.
    }
    window.location.reload()
    return true
}

/**
 * Install global listeners. Call once from main.tsx so a chunk failure that
 * escapes every React error boundary (e.g. from a non-lazy `import()`) still
 * triggers a recovery reload.
 */
export function installChunkReloadListeners(): void {
    window.addEventListener('vite:preloadError', (event) => {
        if (tryReloadForChunkError()) event.preventDefault?.()
    })
    window.addEventListener('unhandledrejection', (event) => {
        if (isChunkLoadError(event.reason)) {
            if (tryReloadForChunkError()) event.preventDefault()
        }
    })
}
