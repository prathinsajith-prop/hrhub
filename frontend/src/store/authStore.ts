import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Tenant } from '@/types'

interface AuthState {
  user: User | null
  tenant: Tenant | null
  isAuthenticated: boolean
  accessToken: string | null
  refreshToken: string | null
  login: (user: User, tenant: Tenant, accessToken: string, refreshToken: string) => void
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
      login: (user, tenant, accessToken, refreshToken) =>
        set({ user, tenant, isAuthenticated: true, accessToken, refreshToken }),
      setUser: (patch) => {
        const current = get().user
        if (!current) return
        set({ user: { ...current, ...patch } })
      },
      logout: () => {
        // Fire-and-forget logout call
        const token = get().accessToken
        if (token) {
          fetch('/api/v1/auth/logout', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => { })
        }
        set({ user: null, tenant: null, isAuthenticated: false, accessToken: null, refreshToken: null })
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
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        isAuthenticated: state.isAuthenticated,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
)
