/**
 * Shared API base URL. Imported by api.ts and authStore.ts to avoid circular deps.
 *   • Local dev  → defaults to '/api/v1' (proxied by Vite)
 *   • Production → set VITE_API_URL at build time, e.g. https://api.example.com/api/v1
 */
const ENV = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
export const apiBase = ENV && ENV.length > 0 ? ENV : '/api/v1'
