/**
 * Shared API base URL — used by api.ts and authStore.ts.
 * Local dev: defaults to '/api/v1' which Vite proxies to backend-portal on :4001.
 * Production: set VITE_API_URL at build time (e.g. https://api-portal.example.com/api/v1).
 */
const ENV = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
export const apiBase = ENV && ENV.length > 0 ? ENV : '/api/v1'
