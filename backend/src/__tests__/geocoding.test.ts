/**
 * Unit tests for `pickLabel` — the pure function that boils a Nominatim
 * reverse-geocoding payload down to a short "POI, road, city" label.
 *
 * The `reverseGeocode` wrapper around it talks to the network + caches,
 * so it's tested separately (or skipped). This file exercises just the
 * formatting rules:
 *   • point-of-interest (building/amenity/office/shop) leads the label
 *   • a road-level part follows when present, otherwise neighbourhood /
 *     suburb / city_district as fallbacks
 *   • city/town/village appended once, never duplicated
 *   • bare `country` is only used when nothing else is available
 *   • `display_name` trimmed to first 3 commas as the last-ditch fallback
 *   • returns `null` for completely empty payloads
 */
import { describe, it, expect } from 'vitest'
import { pickLabel } from '../lib/geocoding.js'

describe('pickLabel', () => {
    it('prefers POI + road + city', () => {
        expect(pickLabel({
            address: {
                building: 'Burj Khalifa',
                road: '1 Sheikh Mohammed bin Rashid Blvd',
                city: 'Dubai',
            },
        })).toBe('Burj Khalifa, 1 Sheikh Mohammed bin Rashid Blvd, Dubai')
    })

    it('falls back to amenity / office / shop for POI', () => {
        expect(pickLabel({ address: { amenity: 'Coffee Hub', city: 'Dubai' } })).toBe('Coffee Hub, Dubai')
        expect(pickLabel({ address: { office: 'WeWork Hub71', city: 'Abu Dhabi' } })).toBe('WeWork Hub71, Abu Dhabi')
        expect(pickLabel({ address: { shop: 'Carrefour', city: 'Sharjah' } })).toBe('Carrefour, Sharjah')
    })

    it('uses neighbourhood when road is missing', () => {
        expect(pickLabel({
            address: { neighbourhood: 'Dubai Marina', city: 'Dubai' },
        })).toBe('Dubai Marina, Dubai')
    })

    it('uses suburb when both road and neighbourhood are missing', () => {
        expect(pickLabel({ address: { suburb: 'JBR', city: 'Dubai' } })).toBe('JBR, Dubai')
    })

    it('uses city_district as a last road-tier fallback', () => {
        expect(pickLabel({ address: { city_district: 'Bur Dubai', city: 'Dubai' } })).toBe('Bur Dubai, Dubai')
    })

    it('does not duplicate the city when it appears at a lower tier too', () => {
        // E.g. some payloads put "Dubai" in `suburb` AND `city`. The label
        // must not read "Dubai, Dubai".
        expect(pickLabel({ address: { suburb: 'Dubai', city: 'Dubai' } })).toBe('Dubai')
    })

    it('uses town when city is absent', () => {
        expect(pickLabel({ address: { road: 'Corniche Road', town: 'Fujairah' } })).toBe('Corniche Road, Fujairah')
    })

    it('uses village when both city and town are absent', () => {
        expect(pickLabel({ address: { road: 'Main Street', village: 'Hatta' } })).toBe('Main Street, Hatta')
    })

    it('falls back to country only when nothing else matches', () => {
        expect(pickLabel({ address: { country: 'United Arab Emirates' } })).toBe('United Arab Emirates')
    })

    it('uses display_name trimmed to first 3 commas when address parts are missing', () => {
        expect(pickLabel({
            display_name: 'Building 5, Office 22, Dubai Internet City, Dubai, UAE, 123456',
        })).toBe('Building 5, Office 22, Dubai Internet City')
    })

    it('returns null for a completely empty payload', () => {
        expect(pickLabel({})).toBeNull()
        expect(pickLabel({ address: {} })).toBeNull()
    })

    it('returns null when display_name is empty after trim', () => {
        expect(pickLabel({ display_name: '   ' })).toBeNull()
    })
})
