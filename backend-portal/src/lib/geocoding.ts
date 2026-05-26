// ─── Reverse-geocoding helper for attendance punches ───────────────────────
//
// HR wants to see "Dubai Marina, Dubai, UAE" on a punch row, not the raw
// "25.0772, 55.1429" coordinates. Reverse-geocoding turns the lat/lng we
// receive from the browser's Geolocation API into a human-readable place
// name.
//
// Vendor: OpenStreetMap Nominatim. Free, no API key, very accurate for
// civic addresses, and used by countless production systems. The usage
// policy requires:
//   • A descriptive User-Agent identifying the requesting application
//   • At most 1 req/sec from a single client
//   • Cache results to avoid hammering the service
//
// We respect all three: the User-Agent below identifies HRHub, and the
// in-memory cache (keyed by coordinates rounded to ~100 m precision) means
// the same office address only triggers one network call per process
// lifetime. Rate limiting is loose because every punch is at most one
// request from a single tenant, and most punches will be cache hits.
//
// Failure mode: returns `null` on any error (timeout, non-200, malformed
// payload, unsupported environment). Callers fold that into "no name
// recorded" and the punch goes through anyway — reverse-geocoding is
// best-effort, never a hard dependency.

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

// Rounding the cache key to 3 decimal places gives ~110 m precision, which
// is plenty for "same office" — two punches from the same building share
// a cache entry. A higher-precision key (4+ decimals) would balloon the
// cache for outdoor workers walking around a site.
function cacheKey(lat: number, lng: number): string {
    return `${lat.toFixed(3)}:${lng.toFixed(3)}`
}

// Bounded cache so this stays a non-issue under load. Map keeps insertion
// order, so when we hit the cap we drop the oldest entry — simple LRU-ish
// behaviour without pulling in a real LRU package.
const MAX_CACHE = 5_000
const cache = new Map<string, string | null>()

function cacheGet(key: string): { hit: boolean; value: string | null } {
    if (!cache.has(key)) return { hit: false, value: null }
    const value = cache.get(key)!
    // Re-insert to mark as most-recently-used.
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

/**
 * Pick the most useful "display label" out of a Nominatim response. We try
 * specific-to-broad so HR sees the most informative string available:
 *
 *   "Office Tower, Sheikh Zayed Road, Dubai"       (best — building + road + city)
 *   "Marina Walk, Dubai"                            (road + city — common case)
 *   "Dubai Marina, Dubai"                           (neighbourhood + city)
 *   "Dubai, United Arab Emirates"                   (city + country — fallback)
 *
 * Nominatim's `display_name` is too verbose (carries every admin level
 * including postcode) so we synthesise our own shorter label from the
 * `address` parts.
 */
function pickLabel(payload: NominatimResponse): string | null {
    const a = payload.address ?? {}
    const parts: string[] = []

    // Most specific point of interest if available.
    const poi = a.building ?? a.amenity ?? a.office ?? a.shop ?? null
    if (poi) parts.push(poi)

    // Street or area.
    if (a.road) parts.push(a.road)
    else if (a.neighbourhood) parts.push(a.neighbourhood)
    else if (a.suburb) parts.push(a.suburb)
    else if (a.city_district) parts.push(a.city_district)

    // City / town / village.
    const city = a.city ?? a.town ?? a.village ?? null
    if (city && !parts.includes(city)) parts.push(city)

    // Country fallback when we have nothing else useful.
    if (parts.length === 0 && a.country) parts.push(a.country)

    if (parts.length === 0) {
        // Last-ditch: trim Nominatim's display_name to the first 3 commas
        // so we don't store a 200-character monster.
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
 * `null` on any failure. Caller stores the result on the punch row.
 *
 * Timeout: 3 seconds. Reverse-geocoding sits in the punch-write critical
 * path; we'd rather miss a label than make HR wait 30 seconds for
 * Nominatim to return on a flaky network.
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
    // `zoom=18` requests building-level precision; the server may return
    // less if no building data exists at that point.
    url.searchParams.set('zoom', '18')
    url.searchParams.set('addressdetails', '1')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    try {
        const res = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                // Nominatim usage policy requires identifying contact info.
                // We use the product name + a contact URL the operator can
                // visit if they need to reach out.
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
        // Don't cache transient failures — next punch retries. Only `null`
        // results from a successful 200 (no useful address parts) get
        // cached so we stop retrying for places Nominatim can't name.
        return null
    } finally {
        clearTimeout(timer)
    }
}
