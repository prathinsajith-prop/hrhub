import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { User, Tenant } from '@/types'
import { apiBase } from '@/lib/apiBase'

const KEEP_SIGNED_IN_KEY = 'hrhub-portal-keep-signed-in'
const AUTH_KEY = 'hrhub-portal-auth'

function preferLocalStorage() {
    try { return localStorage.getItem(KEEP_SIGNED_IN_KEY) === 'true' } catch { return false }
}

const dynamicStorage = {
    getItem: (name: string) => {
        try {
            return preferLocalStorage() ? localStorage.getItem(name) : sessionStorage.getItem(name)
        } catch { return null }
    },
    setItem: (name: string, value: string) => {
        try {
            if (preferLocalStorage()) {
                localStorage.setItem(name, value)
                sessionStorage.removeItem(name)
            } else {
                sessionStorage.setItem(name, value)
                localStorage.removeItem(name)
            }
        } catch { /* ignore */ }
    },
    removeItem: (name: string) => {
        try { localStorage.removeItem(name) } catch { /* ignore */ }
        try { sessionStorage.removeItem(name) } catch { /* ignore */ }
    },
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
                try { localStorage.setItem(KEEP_SIGNED_IN_KEY, String(keepSignedIn)) } catch { /* ignore */ }
                set({ user, tenant, isAuthenticated: true, accessToken, refreshToken, keepSignedIn })
            },
            setUser: (patch) => {
                const current = get().user
                if (!current) return
                set({ user: { ...current, ...patch } })
            },
            logout: () => {
                const token = get().accessToken
                const refreshToken = get().refreshToken
                if (token) {
                    fetch(`${apiBase}/auth/logout`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken }),
                    }).catch(() => { })
                }
                try { localStorage.removeItem(KEEP_SIGNED_IN_KEY) } catch { /* ignore */ }
                try { localStorage.removeItem(AUTH_KEY) } catch { /* ignore */ }
                try { sessionStorage.removeItem(AUTH_KEY) } catch { /* ignore */ }
                set({ user: null, tenant: null, isAuthenticated: false, accessToken: null, refreshToken: null, keepSignedIn: false })
            },
            refreshTokens: async () => {
                const { refreshToken } = get()
                if (!refreshToken) return false
                try {
                    const res = await fetch(`${apiBase}/auth/refresh`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken }),
                    })
                    if (!res.ok) return false
                    const { data } = await res.json()
                    set({ accessToken: data.accessToken, refreshToken: data.refreshToken })
                    return true
                } catch {
                    return false
                }
            },
        }),
        {
            name: AUTH_KEY,
            storage: createJSONStorage(() => dynamicStorage),
            partialize: (state) => ({
                user: state.user,
                tenant: state.tenant,
                isAuthenticated: state.isAuthenticated,
                accessToken: state.accessToken,
                refreshToken: state.refreshToken,
                keepSignedIn: state.keepSignedIn,
            }),
        },
    ),
)
