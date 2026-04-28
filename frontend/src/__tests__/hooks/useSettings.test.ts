import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mock api so the hooks don't pull in zustand-persist or hit real fetch.
const apiMock = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
}
vi.mock('@/lib/api', () => ({ api: apiMock }))

const {
    useCompanySettings,
    useUpdateCompanySettings,
    useTenantUsers,
    useUpdateUser,
    useTwoFaStatus,
    useTwoFaSetup,
    useTwoFaVerify,
    useTwoFaDisable,
    useTwoFaRegenerateBackupCodes,
    useIpAllowlist,
    useUpdateIpAllowlist,
    useNotifPrefs,
    useUpdateNotifPrefs,
    useSecuritySettings,
    useUpdateSecuritySettings,
    useRegionalSettings,
    useUpdateRegionalSettings,
} = await import('@/hooks/useSettings')

function makeWrapper() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    })
    return ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
    Object.values(apiMock).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset())
})

// ─── Company settings ─────────────────────────────────────────────────────────
describe('useCompanySettings', () => {
    it('GETs /settings/company and returns the unwrapped data', async () => {
        apiMock.get.mockResolvedValue({ data: { id: 't1', name: 'Acme', tradeLicenseNo: 'TL-1', jurisdiction: 'mainland', industryType: 'tech', subscriptionPlan: 'free', logoUrl: null } })
        const { result } = renderHook(() => useCompanySettings(), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(apiMock.get).toHaveBeenCalledWith('/settings/company')
        expect(result.current.data?.name).toBe('Acme')
    })
})

describe('useUpdateCompanySettings', () => {
    it('PATCHes /settings/company with the supplied payload', async () => {
        apiMock.patch.mockResolvedValue({ data: { id: 't1', name: 'New Name', tradeLicenseNo: 'TL-1', jurisdiction: 'mainland', industryType: 'tech', subscriptionPlan: 'free', logoUrl: null } })
        const { result } = renderHook(() => useUpdateCompanySettings(), { wrapper: makeWrapper() })
        await act(async () => { await result.current.mutateAsync({ name: 'New Name' }) })
        expect(apiMock.patch).toHaveBeenCalledWith('/settings/company', { name: 'New Name' })
    })
})

// ─── Tenant users ─────────────────────────────────────────────────────────────
describe('useTenantUsers', () => {
    it('GETs /settings/users and returns the array', async () => {
        apiMock.get.mockResolvedValue({ data: [{ id: 'u1', name: 'Jane', email: 'j@x.com', role: 'employee', department: null, isActive: true, lastLoginAt: null, createdAt: '2026-01-01', employeeId: null }] })
        const { result } = renderHook(() => useTenantUsers(), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(apiMock.get).toHaveBeenCalledWith('/settings/users')
        expect(result.current.data?.[0]?.name).toBe('Jane')
    })
})

describe('useUpdateUser', () => {
    it('PATCHes /settings/users/:id with the patch body (excluding id)', async () => {
        apiMock.patch.mockResolvedValue({ data: { id: 'u1', isActive: false } })
        const { result } = renderHook(() => useUpdateUser(), { wrapper: makeWrapper() })
        await act(async () => { await result.current.mutateAsync({ id: 'u1', isActive: false, role: 'employee' }) })
        expect(apiMock.patch).toHaveBeenCalledWith('/settings/users/u1', { isActive: false, role: 'employee' })
    })
})

// ─── 2FA hooks ────────────────────────────────────────────────────────────────
describe('useTwoFaStatus', () => {
    it('GETs /auth/2fa/status', async () => {
        apiMock.get.mockResolvedValue({ data: { enabled: false, backupCodesRemaining: 0 } })
        const { result } = renderHook(() => useTwoFaStatus(), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(apiMock.get).toHaveBeenCalledWith('/auth/2fa/status')
        expect(result.current.data?.enabled).toBe(false)
    })
})

describe('useTwoFaSetup', () => {
    it('POSTs /auth/2fa/setup with an empty body and returns qr + secret', async () => {
        apiMock.post.mockResolvedValue({ data: { qrDataUrl: 'data:image/png;base64,xx', secret: 'ABC123' } })
        const { result } = renderHook(() => useTwoFaSetup(), { wrapper: makeWrapper() })
        const out = await act(async () => result.current.mutateAsync())
        expect(apiMock.post).toHaveBeenCalledWith('/auth/2fa/setup', {})
        expect(out?.secret).toBe('ABC123')
    })
})

describe('useTwoFaVerify', () => {
    it('POSTs /auth/2fa/verify with { token }', async () => {
        apiMock.post.mockResolvedValue({ data: { enabled: true, backupCodes: ['a', 'b'] } })
        const { result } = renderHook(() => useTwoFaVerify(), { wrapper: makeWrapper() })
        await act(async () => { await result.current.mutateAsync('123456') })
        expect(apiMock.post).toHaveBeenCalledWith('/auth/2fa/verify', { token: '123456' })
    })
})

describe('useTwoFaDisable', () => {
    it('POSTs /auth/2fa/disable with { token }', async () => {
        apiMock.post.mockResolvedValue({ data: { enabled: false } })
        const { result } = renderHook(() => useTwoFaDisable(), { wrapper: makeWrapper() })
        await act(async () => { await result.current.mutateAsync('654321') })
        expect(apiMock.post).toHaveBeenCalledWith('/auth/2fa/disable', { token: '654321' })
    })
})

describe('useTwoFaRegenerateBackupCodes', () => {
    it('POSTs /auth/2fa/backup-codes/regenerate with { token }', async () => {
        apiMock.post.mockResolvedValue({ data: { backupCodes: ['x', 'y', 'z'] } })
        const { result } = renderHook(() => useTwoFaRegenerateBackupCodes(), { wrapper: makeWrapper() })
        const out = await act(async () => result.current.mutateAsync('111111'))
        expect(apiMock.post).toHaveBeenCalledWith('/auth/2fa/backup-codes/regenerate', { token: '111111' })
        expect(out?.backupCodes).toEqual(['x', 'y', 'z'])
    })
})

// ─── IP Allowlist ─────────────────────────────────────────────────────────────
describe('useIpAllowlist', () => {
    it('GETs /settings/ip-allowlist', async () => {
        apiMock.get.mockResolvedValue({ data: { ipAllowlist: ['10.0.0.0/8'] } })
        const { result } = renderHook(() => useIpAllowlist(), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(apiMock.get).toHaveBeenCalledWith('/settings/ip-allowlist')
        expect(result.current.data?.ipAllowlist).toEqual(['10.0.0.0/8'])
    })
})

describe('useUpdateIpAllowlist', () => {
    it('PUTs /settings/ip-allowlist with { ipAllowlist }', async () => {
        apiMock.put.mockResolvedValue({ data: { ipAllowlist: ['1.2.3.4'] } })
        const { result } = renderHook(() => useUpdateIpAllowlist(), { wrapper: makeWrapper() })
        await act(async () => { await result.current.mutateAsync(['1.2.3.4']) })
        expect(apiMock.put).toHaveBeenCalledWith('/settings/ip-allowlist', { ipAllowlist: ['1.2.3.4'] })
    })
})

// ─── Notification preferences ─────────────────────────────────────────────────
describe('useNotifPrefs', () => {
    it('GETs /settings/notifications', async () => {
        apiMock.get.mockResolvedValue({ data: { visa_expiry: { email: true, push: false } } })
        const { result } = renderHook(() => useNotifPrefs(), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(apiMock.get).toHaveBeenCalledWith('/settings/notifications')
    })
})

describe('useUpdateNotifPrefs', () => {
    it('PUTs /settings/notifications with the prefs object directly (not wrapped)', async () => {
        apiMock.put.mockResolvedValue({ data: { visa_expiry: { email: false, push: true } } })
        const { result } = renderHook(() => useUpdateNotifPrefs(), { wrapper: makeWrapper() })
        const prefs = { visa_expiry: { email: false, push: true } }
        await act(async () => { await result.current.mutateAsync(prefs) })
        expect(apiMock.put).toHaveBeenCalledWith('/settings/notifications', prefs)
    })
})

// ─── Security settings ────────────────────────────────────────────────────────
describe('useSecuritySettings', () => {
    it('GETs /settings/security', async () => {
        apiMock.get.mockResolvedValue({ data: { sessionTimeoutMinutes: 480, auditLoggingEnabled: true } })
        const { result } = renderHook(() => useSecuritySettings(), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(apiMock.get).toHaveBeenCalledWith('/settings/security')
        expect(result.current.data?.sessionTimeoutMinutes).toBe(480)
    })
})

describe('useUpdateSecuritySettings', () => {
    it('PATCHes /settings/security with the partial payload', async () => {
        apiMock.patch.mockResolvedValue({ data: { sessionTimeoutMinutes: 0, auditLoggingEnabled: true } })
        const { result } = renderHook(() => useUpdateSecuritySettings(), { wrapper: makeWrapper() })
        await act(async () => { await result.current.mutateAsync({ sessionTimeoutMinutes: 0 }) })
        expect(apiMock.patch).toHaveBeenCalledWith('/settings/security', { sessionTimeoutMinutes: 0 })
    })
})

// ─── Regional settings ────────────────────────────────────────────────────────
describe('useRegionalSettings', () => {
    it('GETs /settings/regional', async () => {
        apiMock.get.mockResolvedValue({ data: { timezone: 'Asia/Dubai', currency: 'AED', dateFormat: 'DD/MM/YYYY' } })
        const { result } = renderHook(() => useRegionalSettings(), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(apiMock.get).toHaveBeenCalledWith('/settings/regional')
    })
})

describe('useUpdateRegionalSettings', () => {
    it('PATCHes /settings/regional with the partial payload', async () => {
        apiMock.patch.mockResolvedValue({ data: { timezone: 'UTC', currency: 'USD', dateFormat: 'YYYY-MM-DD' } })
        const { result } = renderHook(() => useUpdateRegionalSettings(), { wrapper: makeWrapper() })
        await act(async () => { await result.current.mutateAsync({ timezone: 'UTC' }) })
        expect(apiMock.patch).toHaveBeenCalledWith('/settings/regional', { timezone: 'UTC' })
    })
})

// ─── Behavioural regression: settings hooks must not wrap or re-shape payloads ─
describe('useUpdateNotifPrefs payload shape (regression)', () => {
    it('does NOT wrap prefs in { prefs: ... } — backend expects the object at the body root', async () => {
        apiMock.put.mockResolvedValue({ data: {} })
        const { result } = renderHook(() => useUpdateNotifPrefs(), { wrapper: makeWrapper() })
        await act(async () => { await result.current.mutateAsync({ a: { email: true, push: false } }) })
        const [, body] = apiMock.put.mock.calls[0]
        expect(body).toEqual({ a: { email: true, push: false } })
        expect(body).not.toHaveProperty('prefs')
    })
})
