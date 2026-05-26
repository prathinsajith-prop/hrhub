// ─── Portal geolocation — robust acquisition for attendance punches ─────────
//
// Why this lives in its own file:
//
// The old inline `readGeolocation` in AttendancePage.tsx collapsed every
// failure mode (timeout, denied, position unavailable, no API) into
// `Promise<{lat,lng} | null>`. The UI couldn't tell whether the user had
// blocked permission or whether the browser had simply given up on
// getting a fix — so every failure rendered "Location access is off",
// which gaslit users with permission already granted into thinking the
// product was broken.
//
// This module fixes three concrete pain points HR has hit repeatedly:
//
//   1. **Cold-start fixes time out.** A mobile GPS lock can routinely
//      take 10–20 seconds (indoors, weak signal, first read of the
//      session). The old 6-second outer timeout reported these as
//      "denied". We now distinguish reasons and give the *click path*
//      a longer budget than the *idle strip*.
//
//   2. **getCurrentPosition is one-shot.** If the OS doesn't have a
//      cached fix, it has to go cold — and a single getCurrentPosition
//      call returns nothing until that finishes. `watchPosition`, by
//      contrast, streams: the first cached / coarse fix lands almost
//      immediately, then refines. We use watchPosition on the click
//      path and take the *first acceptable* fix.
//
//   3. **High-accuracy was off.** The old code passed
//      `enableHighAccuracy: false` everywhere — fine for the strip
//      preview, but on the click path we want the device to engage
//      its GPS chip if it has one. We flip the flag depending on
//      context.
//
// API:
//
//   acquireLocation({ purpose, signal })
//
//     purpose: 'preview' — eager strip read on mount; short timeout,
//                          fast/cached preferred, low accuracy.
//     purpose: 'punch'   — user-initiated; long timeout (up to 20s),
//                          high accuracy, accepts streamed first fix.
//
// Always resolves with a discriminated union the caller can branch on.

export type GeolocationFailureReason =
    /** Browser / OS has no Geolocation API. */
    | 'unsupported'
    /** User explicitly blocked permission. They need to change browser/OS settings. */
    | 'denied'
    /** Device couldn't get any fix in the timeout (weak signal, no GPS hardware). */
    | 'unavailable'
    /** Outer timeout fired before the device returned anything. */
    | 'timeout'

export type GeolocationResult =
    | { ok: true; coords: { latitude: number; longitude: number; accuracy: number } }
    | { ok: false; reason: GeolocationFailureReason }

export interface AcquireLocationOptions {
    /** Picks the timing + accuracy profile. */
    purpose: 'preview' | 'punch'
    /** Optional AbortSignal to cancel mid-flight (e.g. dialog closed). */
    signal?: AbortSignal
    /**
     * Overrides for tests. In production this is always `navigator.geolocation`.
     */
    geolocation?: Geolocation
}

interface Profile {
    /** Outer timeout we enforce ourselves — covers the "browser silently never resolves" case. */
    outerMs: number
    /** Inner timeout passed to the Geolocation API. */
    innerMs: number
    /** Accept a cached fix this old without firing a fresh read. */
    maximumAgeMs: number
    /** High-accuracy hint (engages GPS chip on mobile). */
    enableHighAccuracy: boolean
    /**
     * When true, use `watchPosition` and take the first fix (much faster on
     * mobile because the cached coarse fix lands before the GPS lock).
     */
    streamFirstFix: boolean
}

const PROFILES: Record<'preview' | 'punch', Profile> = {
    // Strip preview — we want SOMETHING fast to put on screen. A 60-sec
    // cached fix is fine; the user only needs to see "your punch will be
    // tagged at roughly here". Don't burn battery firing GPS in this path.
    preview: {
        outerMs: 10_000,
        innerMs: 9_000,
        maximumAgeMs: 60_000,
        enableHighAccuracy: false,
        streamFirstFix: false,
    },
    // Click path — user is actively waiting, willing to spend a few seconds
    // for an accurate fix. We stream so the first cached coarse fix lands
    // immediately; the inner timeout governs the rare cold-start case where
    // even cached fixes are absent.
    punch: {
        outerMs: 20_000,
        innerMs: 18_000,
        // Lower maximumAge — the user just clicked "check in", they likely
        // care that the recorded position reflects "now", not the position
        // when the page first loaded an hour ago.
        maximumAgeMs: 15_000,
        enableHighAccuracy: true,
        streamFirstFix: true,
    },
}

function classifyError(err: GeolocationPositionError): GeolocationFailureReason {
    // PERMISSION_DENIED (1), POSITION_UNAVAILABLE (2), TIMEOUT (3).
    if (err.code === err.PERMISSION_DENIED) return 'denied'
    if (err.code === err.TIMEOUT) return 'timeout'
    return 'unavailable'
}

export function acquireLocation({
    purpose,
    signal,
    geolocation,
}: AcquireLocationOptions): Promise<GeolocationResult> {
    const geo = geolocation ?? (typeof navigator !== 'undefined' ? navigator.geolocation : undefined)
    if (!geo) {
        return Promise.resolve({ ok: false, reason: 'unsupported' as const })
    }
    const profile = PROFILES[purpose]

    return new Promise((resolve) => {
        let settled = false
        let watchId: number | null = null
        const finish = (result: GeolocationResult) => {
            if (settled) return
            settled = true
            if (watchId !== null) {
                try { geo.clearWatch(watchId) } catch { /* ignore */ }
            }
            clearTimeout(outerTimer)
            signal?.removeEventListener('abort', onAbort)
            resolve(result)
        }

        // Outer guard — covers the bizarre case where the API never resolves.
        // Treat as a timeout so the UI can phrase it correctly.
        const outerTimer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), profile.outerMs)

        const onAbort = () => finish({ ok: false, reason: 'timeout' })
        signal?.addEventListener('abort', onAbort)

        const onPos = (pos: GeolocationPosition) => {
            finish({
                ok: true,
                coords: {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                },
            })
        }
        const onErr = (err: GeolocationPositionError) => {
            // For the streaming path, an intermediate POSITION_UNAVAILABLE
            // is not necessarily final — the watch can recover. But the
            // outer timer + signal will resolve us eventually. To keep
            // logic simple here, we still resolve on the first error;
            // upgrading to "wait for next fix" is a future tweak.
            finish({ ok: false, reason: classifyError(err) })
        }

        const opts: PositionOptions = {
            enableHighAccuracy: profile.enableHighAccuracy,
            maximumAge: profile.maximumAgeMs,
            timeout: profile.innerMs,
        }

        if (profile.streamFirstFix) {
            try {
                watchId = geo.watchPosition(onPos, onErr, opts)
            } catch {
                // Some embedded webviews throw synchronously when watchPosition
                // is called from an insecure context. Fall back to one-shot.
                geo.getCurrentPosition(onPos, onErr, opts)
            }
        } else {
            geo.getCurrentPosition(onPos, onErr, opts)
        }
    })
}

// ─── Reverse-geocoding (client-side preview) ────────────────────────────
//
// Turns lat/lng into a short place-name like "Dubai Marina, Dubai" so the
// strip can show HR what the punch will be tagged as, BEFORE they click.
//
// Vendor: OpenStreetMap Nominatim. CORS-open so we can call it directly
// from the browser. The backend has the same helper for the *stored*
// label — both call the same service so the live preview and the
// recorded row stay consistent.
//
// Cached client-side too, so re-renders / strip refreshes don't repeatedly
// hammer Nominatim. Same 3-decimal rounding (~110 m) as the backend.

interface NominatimResponse {
    display_name?: string
    address?: {
        building?: string
        amenity?: string
        office?: string
        shop?: string
        road?: string
        neighbourhood?: string
        suburb?: string
        city_district?: string
        city?: string
        town?: string
        village?: string
        country?: string
    }
}

const labelCache = new Map<string, string | null>()
const MAX_LABEL_CACHE = 200

function labelCacheKey(lat: number, lng: number): string {
    return `${lat.toFixed(3)}:${lng.toFixed(3)}`
}

function pickLabel(payload: NominatimResponse): string | null {
    const a = payload.address ?? {}
    const parts: string[] = []
    const poi = a.building ?? a.amenity ?? a.office ?? a.shop ?? null
    if (poi) parts.push(poi)
    if (a.road) parts.push(a.road)
    else if (a.neighbourhood) parts.push(a.neighbourhood)
    else if (a.suburb) parts.push(a.suburb)
    else if (a.city_district) parts.push(a.city_district)
    const city = a.city ?? a.town ?? a.village ?? null
    if (city && !parts.includes(city)) parts.push(city)
    if (parts.length === 0 && a.country) parts.push(a.country)
    if (parts.length === 0 && payload.display_name) {
        return payload.display_name.split(',').slice(0, 3).join(',').trim() || null
    }
    return parts.length > 0 ? parts.join(', ') : null
}

/**
 * Resolve a coordinate pair to a short place-name string. Returns `null`
 * on any failure. Caller falls back to displaying coordinates.
 *
 * Timeout: 3 seconds. The strip is happy to show coords-only if Nominatim
 * is slow.
 */
export async function reverseGeocodeClient(
    lat: number,
    lng: number,
): Promise<string | null> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    const key = labelCacheKey(lat, lng)
    if (labelCache.has(key)) return labelCache.get(key) ?? null

    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lng))
    url.searchParams.set('zoom', '18')
    url.searchParams.set('addressdetails', '1')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    try {
        const res = await fetch(url.toString(), {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal,
        })
        if (!res.ok) {
            labelCache.set(key, null)
            return null
        }
        const payload = (await res.json()) as NominatimResponse
        const label = pickLabel(payload)
        // Bounded cache — drop oldest when over capacity.
        if (labelCache.size >= MAX_LABEL_CACHE) {
            const oldest = labelCache.keys().next().value
            if (oldest !== undefined) labelCache.delete(oldest)
        }
        labelCache.set(key, label)
        return label
    } catch {
        return null
    } finally {
        clearTimeout(timer)
    }
}
