import React from 'react'
import { KeyRound, AlertCircle, UserCircle, Check, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { labelFor } from '@/lib/enums'
import { ALL_ROLES, ALL_PERMISSIONS, getRolePermissionMatrix, type Permission } from '@/lib/permissions'
import type { UserRole } from '@/types'
import { Section } from './_shared'

// ─── Roles & Permissions Tab (read-only matrix) ──────────────────────────────
const ROLE_LABEL: Record<UserRole, string> = {
    super_admin: 'Super Admin',
    hr_manager: 'HR Manager',
    pro_officer: 'PRO Officer',
    dept_head: 'Dept Head',
    employee: 'Employee',
}

function permGroup(p: Permission): string {
    if (p.includes('employee') || p.includes('org_chart') || p.includes('exit')) return 'People'
    if (p.includes('leave') || p.includes('attendance') || p.includes('performance')) return 'Time & Performance'
    if (p.includes('payroll')) return 'Payroll'
    if (p.includes('document') || p.includes('visa') || p.includes('compliance')) return 'Compliance & Docs'
    if (p.includes('recruitment') || p.includes('onboarding')) return 'Hiring'
    if (p.includes('asset')) return 'Assets'
    if (p.includes('settings') || p.includes('user') || p.includes('audit')) return 'Administration'
    if (p.includes('report')) return 'Reports'
    return 'Other'
}

export function RolesPermissionsTab() {
    const matrix = getRolePermissionMatrix()
    const grouped = ALL_PERMISSIONS.reduce<Record<string, Permission[]>>((acc, p) => {
        const g = permGroup(p)
        if (!acc[g]) acc[g] = []
        acc[g].push(p)
        return acc
    }, {})
    return (
        <div className="space-y-5">
            <Section
                icon={KeyRound}
                title="Built-in Roles & Permissions"
                description="What each role can do across the workspace. These defaults are managed in code and apply to every organization."
            >
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 mb-4">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>Read-only view. Per-tenant role customization is on the roadmap and will appear here once available.</span>
                </div>
                <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-xs font-medium text-muted-foreground">
                            <tr>
                                <th className="text-start px-3 py-2.5 font-medium sticky start-0 bg-muted/40 min-w-[220px]">Permission</th>
                                {ALL_ROLES.map((r) => (
                                    <th key={r} className="px-2 py-2.5 font-medium text-center min-w-[100px]">{ROLE_LABEL[r]}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(grouped).map(([group, perms]) => (
                                <React.Fragment key={group}>
                                    <tr className="bg-muted/20">
                                        <td colSpan={ALL_ROLES.length + 1} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            {group}
                                        </td>
                                    </tr>
                                    {perms.map((p) => (
                                        <tr key={p} className="border-t hover:bg-muted/20">
                                            <td className="px-3 py-2 text-xs sticky start-0 bg-background">
                                                {labelFor(p)}
                                            </td>
                                            {ALL_ROLES.map((r) => {
                                                const granted = matrix[r]?.includes(p) ?? false
                                                return (
                                                    <td key={r} className="px-2 py-2 text-center">
                                                        {granted ? (
                                                            <Check className="h-4 w-4 text-emerald-600 inline" aria-label="granted" />
                                                        ) : (
                                                            <Minus className="h-4 w-4 text-muted-foreground/40 inline" aria-label="denied" />
                                                        )}
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Section>

            <Section icon={UserCircle} title="Role Summary" description="Quick reference for each role">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {ALL_ROLES.map((r) => {
                        const count = matrix[r]?.length ?? 0
                        const blurb =
                            r === 'super_admin' ? 'Full access to all modules and settings.' :
                                r === 'hr_manager' ? 'Manages employees, payroll, leave, recruitment.' :
                                    r === 'pro_officer' ? 'Handles visa, documents and compliance.' :
                                        r === 'dept_head' ? 'Approves leave and manages team performance.' :
                                            'Self-service for own leave, attendance, payslips.'
                        return (
                            <div key={r} className="rounded-lg border p-4">
                                <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-sm font-semibold">{ROLE_LABEL[r]}</p>
                                    <Badge variant="secondary" className="text-[10px]">{count} perms</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">{blurb}</p>
                            </div>
                        )
                    })}
                </div>
            </Section>
        </div>
    )
}
