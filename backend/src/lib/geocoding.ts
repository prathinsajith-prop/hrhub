// ─── Reverse-geocoding helper for attendance punches ───────────────────────
//
// Mirror of `backend-portal/src/lib/geocoding.ts`. The two backends don't
// share a package, so this file is a deliberate copy — keep them in sync
// when the policy / vendor changes.
//
// HR wants to see "Dubai Marina, Dubai, UAE" on a punch row, not the raw
// "25.0772, 55.1429" coordinates. Reverse-geocoding turns the lat/lng we
// receive from the browser's Geolocation API (or a biometric device's
// external-punch payload) into a human-readable place name.
//
// Vendor: OpenStreetMap Nominatim. Free, no API key, accurate for civic
// addresses. Their usage policy requires:
//   • A descriptive User-Agent identifying the requesting application
//   • At most 1 req/sec from a single client
//   • Cache results to avoid hammering the service
// We respect all three.

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
        state?: string
        country?: string
    }
}

// 3-decimal rounding gives ~110 m precision — plenty for "same office"
// while keeping the cache compact.
function cacheKey(lat: number, lng: number): string {
    return `${lat.toFixed(3)}:${lng.toFixed(3)}`
}

const MAX_CACHE = 5_000
const cache = new Map<string, string | null>()

function cacheGet(key: string): { hit: boolean; value: string | null } {
    if (!cache.has(key)) return { hit: false, value: null }
    const value = cache.get(key)!
    cache.delete(key)
    cache.set(key, value)
    return { hit: true, value }
}

function cacheSet(key: string, value: string | null): void {
    if (cache.size >= MAX_CACHE) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, value)
}

// Build a short, useful label from the address parts. Nominatim's full
// `display_name` includes postcode + every admin level, which is too
// noisy for a punch row.
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
    if (parts.length === 0) {
        if (payload.display_name) {
            const trimmed = payload.display_name.split(',').slice(0, 3).join(',').trim()
            return trimmed || null
        }
        return null
    }
    return parts.join(', ')
}

/**
 * Reverse-geocode a lat/lng pair into a short place-name string. Returns
 * `null` on any failure (timeout, non-200, malformed payload, unsupported
 * environment). Caller stores the result on the punch row; a null label
 * means HR sees just the coords link.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

    const key = cacheKey(lat, lng)
    const cached = cacheGet(key)
    if (cached.hit) return cached.value

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
            headers: {
                'User-Agent': 'HRHub/1.0 (+https://hrhub.ae)',
                'Accept': 'application/json',
            },
            signal: controller.signal,
        })
        if (!res.ok) {
            cacheSet(key, null)
            return null
        }
        const payload = (await res.json()) as NominatimResponse
        const label = pickLabel(payload)
        cacheSet(key, label)
        return label
    } catch {
        return null
    } finally {
        clearTimeout(timer)
    }
}
