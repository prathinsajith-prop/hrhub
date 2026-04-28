import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

// ─── Scope definitions ────────────────────────────────────────────────────────

export const PERMISSIONS = ['read', 'write', 'delete'] as const
export interface ScopeModule { key: string; label: string }
export interface ScopeGroup { label: string; modules: ScopeModule[] }

export const SCOPE_GROUPS: ScopeGroup[] = [
    { label: 'Employees & HR', modules: [{ key: 'employees', label: 'Employees' }, { key: 'onboarding', label: 'Onboarding' }, { key: 'exit', label: 'Exit Management' }] },
    { label: 'Payroll', modules: [{ key: 'payroll', label: 'Payroll' }, { key: 'payslips', label: 'Payslips' }] },
    { label: 'Leave', modules: [{ key: 'leave', label: 'Leave Requests' }, { key: 'leave_policies', label: 'Leave Policies' }] },
    { label: 'Attendance', modules: [{ key: 'attendance', label: 'Attendance' }] },
    { label: 'Recruitment', modules: [{ key: 'recruitment', label: 'Recruitment' }, { key: 'assets', label: 'Assets' }] },
    { label: 'Documents & Compliance', modules: [{ key: 'documents', label: 'Documents' }, { key: 'compliance', label: 'Compliance' }, { key: 'visa', label: 'Visa & Immigration' }] },
    { label: 'Reports & Analytics', modules: [{ key: 'reports', label: 'Reports' }, { key: 'audit', label: 'Audit Logs' }] },
    { label: 'Organization', modules: [{ key: 'team', label: 'User Management' }, { key: 'settings', label: 'Settings' }] },
]

export const ALL_SCOPES = SCOPE_GROUPS.flatMap(g =>
    g.modules.flatMap(m => PERMISSIONS.map(p => `${m.key}:${p}`))
)

// ─── Component ────────────────────────────────────────────────────────────────

export function ScopeMatrix({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

    const toggle = (scope: string) =>
        onChange(value.includes(scope) ? value.filter(s => s !== scope) : [...value, scope])

    const toggleGroup = (group: ScopeGroup) => {
        const gs = group.modules.flatMap(m => PERMISSIONS.map(p => `${m.key}:${p}`))
        const allSel = gs.every(s => value.includes(s))
        onChange(allSel ? value.filter(s => !gs.includes(s)) : [...new Set([...value, ...gs])])
    }

    const toggleCollapse = (label: string) =>
        setCollapsed(prev => {
            const n = new Set(prev)
            if (n.has(label)) { n.delete(label) } else { n.add(label) }
            return n
        })

    const allSelected = ALL_SCOPES.every(s => value.includes(s))

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium">Scopes *</p>
                    <p className="text-xs text-muted-foreground">Select the permissions this app should have.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => onChange(allSelected ? [] : [...ALL_SCOPES])}>
                    {allSelected ? 'Clear All' : 'Select All'}
                </Button>
            </div>
            <div className="rounded-lg border border-border overflow-hidden max-h-80 overflow-y-auto divide-y divide-border">
                {SCOPE_GROUPS.map((group) => {
                    const gs = group.modules.flatMap(m => PERMISSIONS.map(p => `${m.key}:${p}`))
                    const allGrpSel = gs.every(s => value.includes(s))
                    const isCollapsed = collapsed.has(group.label)
                    return (
                        <div key={group.label}>
                            <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
                                <button type="button" className="flex items-center gap-1.5 text-sm font-semibold" onClick={() => toggleCollapse(group.label)}>
                                    {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                                    {group.label}
                                </button>
                                <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => toggleGroup(group)}>
                                    {allGrpSel ? 'Deselect all' : 'Select all'}
                                </button>
                            </div>
                            {!isCollapsed && (
                                <>
                                    <div className="grid grid-cols-[1fr_72px_72px_72px] px-3 py-1.5 bg-muted/10 border-t border-border/40">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Module</span>
                                        {PERMISSIONS.map(p => <span key={p} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-center">{p}</span>)}
                                    </div>
                                    {group.modules.map((mod, mi) => (
                                        <div key={mod.key} className={cn('grid grid-cols-[1fr_72px_72px_72px] px-3 py-2.5 items-center hover:bg-muted/20', mi > 0 && 'border-t border-border/30')}>
                                            <span className="text-sm">{mod.label}</span>
                                            {PERMISSIONS.map(perm => (
                                                <div key={perm} className="flex justify-center">
                                                    <Checkbox
                                                        checked={value.includes(`${mod.key}:${perm}`)}
                                                        onCheckedChange={() => toggle(`${mod.key}:${perm}`)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    )
                })}
            </div>
            {value.length > 0 && (
                <p className="text-xs text-muted-foreground">{value.length} permission{value.length !== 1 ? 's' : ''} selected</p>
            )}
        </div>
    )
}
