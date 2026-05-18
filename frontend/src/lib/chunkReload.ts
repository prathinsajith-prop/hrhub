// Vite splits the app into hashed chunks (`DashboardPage-Dmdyjpt_.js`, …).
// When a new build is deployed, the user's already-loaded `index.html` still
// references the *old* hashes, so the first `React.lazy()` import after deploy
// fails with `Failed to fetch dynamically imported module`. The user sees a
// blank crash screen until they manually reload.
//
// This module:
//   1. Detects that failure mode from an Error / event / message.
//   2. Force-reloads the page so the browser fetches the new index.html and
//      the new chunk hashes.
//   3. Guards against infinite reload loops by stamping a sessionStorage key
//      — if a chunk load fails *again* after reloading, we surface the real
//      error instead of reloading endlessly.

const RELOAD_FLAG = 'hrhub.chunkReload.ts'
// How long after a reload we consider a second chunk failure a real bug
// (not a stale-deploy issue worth retrying).
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
 *
 * Briefly paints an "Updating to the latest version…" overlay before the
 * reload so the screen doesn't just flash blank. The reload is delayed by
 * ~600 ms — long enough for the user to read the message, short enough to
 * stay snappy.
 */
export function tryReloadForChunkError(): boolean {
    try {
        const stamp = Number(sessionStorage.getItem(RELOAD_FLAG) ?? '0')
        if (stamp && Date.now() - stamp < RELOAD_GUARD_MS) {
            // We already reloaded in the last 30s; the new build is still
            // broken for this user. Stop the loop.
            return false
        }
        sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
    } catch {
        // sessionStorage can throw in private mode / sandboxed iframes —
        // fall through to reloading anyway.
    }
    showUpdatingOverlay()
    window.setTimeout(() => {
        // location.reload() refetches index.html with the new chunk hashes
        // and the SPA bootstraps cleanly.
        window.location.reload()
    }, 600)
    return true
}

let overlayInstalled = false

/**
 * Inject a lightweight inline overlay so we don't depend on any UI library
 * during the reload — the React tree may already be in a broken state when
 * we're called. Stays up only until the reload tears the page down.
 */
function showUpdatingOverlay(): void {
    if (overlayInstalled || typeof document === 'undefined') return
    overlayInstalled = true
    const el = document.createElement('div')
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    el.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:2147483647',
        'display:flex', 'align-items:center', 'justify-content:center',
        'background:rgba(15,23,42,0.55)',
        'backdrop-filter:blur(4px)', '-webkit-backdrop-filter:blur(4px)',
        'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
        'color:#0f172a',
    ].join(';')
    el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:24px 32px;border-radius:16px;background:rgba(255,255,255,0.95);box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);max-width:320px;text-align:center">
            <div style="width:32px;height:32px;border:3px solid #6366f1;border-top-color:transparent;border-radius:50%;animation:hrhubChunkSpin 0.8s linear infinite"></div>
            <div>
                <div style="font-weight:600;font-size:15px">Updating to the latest version</div>
                <div style="margin-top:4px;font-size:12px;color:#64748b">We'll bring you back in a moment.</div>
            </div>
        </div>
        <style>@keyframes hrhubChunkSpin{to{transform:rotate(360deg)}}</style>
    `
    document.body.appendChild(el)
}

/**
 * Install global listeners. Call once from main.tsx so a chunk failure that
 * escapes every React error boundary (e.g. from a non-lazy `import()`) still
 * triggers a recovery reload.
 */
export function installChunkReloadListeners(): void {
    // Vite emits this for module-preload failures specifically.
    window.addEventListener('vite:preloadError', (event) => {
        if (tryReloadForChunkError()) event.preventDefault?.()
    })
    // Unhandled `import()` rejections — covers cases where the user navigates
    // before the lazy import is awaited inside a Suspense boundary.
    window.addEventListener('unhandledrejection', (event) => {
        if (isChunkLoadError(event.reason)) {
            if (tryReloadForChunkError()) event.preventDefault()
        }
    })
}
