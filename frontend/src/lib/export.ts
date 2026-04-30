import { useAuthStore } from '@/store/authStore'

export async function downloadExport(path: string, filename: string) {
    const token = useAuthStore.getState().accessToken
    const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1'
    const res = await fetch(`${baseUrl}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`Export failed: ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

function buildQs(params: Record<string, string | number | undefined>) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== '') q.set(k, String(v))
    }
    return q.toString()
}

export async function exportLeave(params: { format?: 'csv' | 'pdf'; status?: string; department?: string; from?: string; to?: string } = {}) {
    const { format = 'csv', ...rest } = params
    const date = new Date().toISOString().slice(0, 10)
    const qs = buildQs({ format, ...rest })
    await downloadExport(`/leave/export?${qs}`, `leave-${format === 'pdf' ? 'report' : 'export'}-${date}.${format}`)
}

export async function exportAttendance(params: { format?: 'csv' | 'pdf'; employeeId?: string; startDate?: string; endDate?: string; status?: string } = {}) {
    const { format = 'csv', ...rest } = params
    const date = new Date().toISOString().slice(0, 10)
    const qs = buildQs({ format, ...rest })
    await downloadExport(`/attendance/export?${qs}`, `attendance-${format === 'pdf' ? 'report' : 'export'}-${date}.${format}`)
}

export async function exportVisa(params: { format?: 'csv' | 'pdf'; status?: string; urgencyLevel?: string; from?: string; to?: string } = {}) {
    const { format = 'csv', ...rest } = params
    const date = new Date().toISOString().slice(0, 10)
    const qs = buildQs({ format, ...rest })
    await downloadExport(`/visa/export?${qs}`, `visa-${format === 'pdf' ? 'report' : 'export'}-${date}.${format}`)
}

export async function exportRecruitment(params: { format?: 'csv' | 'pdf'; jobId?: string; stage?: string } = {}) {
    const { format = 'csv', ...rest } = params
    const date = new Date().toISOString().slice(0, 10)
    const qs = buildQs({ format, ...rest })
    await downloadExport(`/applications/export?${qs}`, `recruitment-${format === 'pdf' ? 'report' : 'export'}-${date}.${format}`)
}

export async function exportPerformance(params: { format?: 'csv' | 'pdf'; employeeId?: string; from?: string; to?: string } = {}) {
    const { format = 'csv', ...rest } = params
    const date = new Date().toISOString().slice(0, 10)
    const qs = buildQs({ format, ...rest })
    await downloadExport(`/performance/export?${qs}`, `performance-${format === 'pdf' ? 'report' : 'export'}-${date}.${format}`)
}

export async function exportAssets(params: { format?: 'csv' | 'pdf'; status?: string; category?: string } = {}) {
    const { format = 'csv', ...rest } = params
    const date = new Date().toISOString().slice(0, 10)
    const qs = buildQs({ format, ...rest })
    await downloadExport(`/assets/export?${qs}`, `assets-${format === 'pdf' ? 'report' : 'export'}-${date}.${format}`)
}

export async function exportAuditLog(params: { format?: 'csv' | 'pdf'; entityType?: string; userId?: string } = {}) {
    const { format = 'csv', ...rest } = params
    const date = new Date().toISOString().slice(0, 10)
    const qs = buildQs({ format, ...rest })
    await downloadExport(`/audit/export?${qs}`, `audit-${format === 'pdf' ? 'log' : 'export'}-${date}.${format}`)
}

export async function exportEmployees(params: { format?: 'csv' | 'pdf'; department?: string; status?: string } = {}) {
    const { format = 'csv', ...rest } = params
    const date = new Date().toISOString().slice(0, 10)
    const qs = buildQs({ format, ...rest })
    await downloadExport(`/employees/export?${qs}`, `employees-${format === 'pdf' ? 'report' : 'export'}-${date}.${format}`)
}

export async function exportExit(params: { format?: 'csv' | 'pdf'; status?: string } = {}) {
    const { format = 'csv', ...rest } = params
    const date = new Date().toISOString().slice(0, 10)
    const qs = buildQs({ format, ...rest })
    await downloadExport(`/exit/export?${qs}`, `exit-${format === 'pdf' ? 'report' : 'export'}-${date}.${format}`)
}
