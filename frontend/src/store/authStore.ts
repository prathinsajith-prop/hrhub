import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { User, Tenant } from '@/types'

// Key used to decide which storage to use across page loads
const KEEP_SIGNED_IN_KEY = 'hrhub-keep-signed-in'

function getStorage() {
  try {
    return localStorage.getItem(KEEP_SIGNED_IN_KEY) === 'true'
      ? localStorage
      : sessionStorage
  } catch {
    return sessionStorage
  }
}

interface AuthState {
  user: User | null
  tenant: Tenant | null
  isAuthenticated: boolean
  accessToken: string | null
  refreshToken: string | null
  keepSignedIn: boolean
  login: (user: User, tenant: Tenant, accessToken: string, refreshToken: string, keepSignedIn?: boolean) => void
  logout: () => void
  refreshTokens: () => Promise<boolean>
  setUser: (patch: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tenant: null,
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      keepSignedIn: false,
      login: (user, tenant, accessToken, refreshToken, keepSignedIn = false) => {
        // Persist preference so getStorage() picks the right store on next load
        try {
          localStorage.setItem(KEEP_SIGNED_IN_KEY, String(keepSignedIn))
          if (!keepSignedIn) {
            // Remove any stale localStorage auth so a new tab starts fresh
            localStorage.removeItem('hrhub-auth')
          }
        } catch { /* ignore */ }
        set({ user, tenant, isAuthenticated: true, accessToken, refreshToken, keepSignedIn })
      },
      setUser: (patch) => {
        const current = get().user
        if (!current) return
        set({ user: { ...current, ...patch } })
      },
      logout: () => {
        const token = get().accessToken
        if (token) {
          fetch('/api/v1/auth/logout', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => { })
        }
        try { localStorage.removeItem(KEEP_SIGNED_IN_KEY) } catch { /* ignore */ }
        set({ user: null, tenant: null, isAuthenticated: false, accessToken: null, refreshToken: null, keepSignedIn: false })
      },
      refreshTokens: async () => {
        const { refreshToken } = get()
        if (!refreshToken) return false
        try {
          const res = await fetch('/api/v1/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          })
          if (!res.ok) return false
          const { data } = await res.json()
          // Also sync employeeId onto the user object if the refresh response
          // returns it (backend now includes it) — fixes stale persisted state.
          const currentUser = get().user
          if (currentUser && !currentUser.employeeId && data.employeeId) {
            set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: { ...currentUser, employeeId: data.employeeId } })
          } else {
            set({ accessToken: data.accessToken, refreshToken: data.refreshToken })
          }
          return true
        } catch {
          return false
        }
      },
    }),
    {
      name: 'hrhub-auth',
      storage: createJSONStorage(getStorage),
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        isAuthenticated: state.isAuthenticated,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        keepSignedIn: state.keepSignedIn,
      }),
    }
  )
)
