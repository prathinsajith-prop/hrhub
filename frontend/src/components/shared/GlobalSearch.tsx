import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandSeparator,
} from '@/components/ui/command'
import {
    LayoutDashboard,
    Users,
    Briefcase,
    UserCheck,
    Plane,
    FileText,
    CreditCard,
    CalendarDays,
    ShieldCheck,
    BarChart3,
    Settings,
    DoorOpen,
    CalendarClock,
    TrendingUp,
    ClipboardList,
    Bell,
} from 'lucide-react'
import { useEmployees } from '@/hooks/useEmployees'
import { useOrgUnits } from '@/hooks/useOrgUnits'
import { buildOrgUnitMap, resolveOrgPath } from '@/lib/orgUtils'
import { OrgHierarchyPath } from '@/components/shared/OrgHierarchyPath'

const NAV_ITEMS = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, keywords: 'home overview' },
    { label: 'Employees', path: '/employees', icon: Users, keywords: 'staff people hr' },
    { label: 'Recruitment', path: '/recruitment', icon: Briefcase, keywords: 'jobs hiring candidates' },
    { label: 'Onboarding', path: '/onboarding', icon: UserCheck, keywords: 'new hire setup' },
    { label: 'Visa & PRO', path: '/visa', icon: Plane, keywords: 'immigration residency eid' },
    { label: 'Documents', path: '/documents', icon: FileText, keywords: 'files contracts letters' },
    { label: 'Payroll', path: '/payroll', icon: CreditCard, keywords: 'salary wps sif payment' },
    { label: 'Leave', path: '/leave', icon: CalendarDays, keywords: 'vacation annual sick time off' },
    { label: 'Attendance', path: '/attendance', icon: CalendarClock, keywords: 'clock in out presence' },
    { label: 'Performance', path: '/performance', icon: TrendingUp, keywords: 'appraisal review goals kpi' },
    { label: 'Compliance', path: '/compliance', icon: ShieldCheck, keywords: 'uae labor law audit' },
    { label: 'Reports', path: '/reports', icon: BarChart3, keywords: 'analytics charts export' },
    { label: 'Org Chart', path: '/org-chart', icon: Users, keywords: 'organization structure hierarchy' },
    { label: 'Exit Management', path: '/exit', icon: DoorOpen, keywords: 'offboarding termination resignation' },
    { label: 'Audit Log', path: '/audit', icon: ClipboardList, keywords: 'activity history changes' },
    { label: 'Notifications', path: '/notifications', icon: Bell, keywords: 'alerts reminders' },
    { label: 'Settings', path: '/settings', icon: Settings, keywords: 'profile company security 2fa' },
]

interface GlobalSearchProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
    const navigate = useNavigate()
    const [query, setQuery] = useState('')

    const { data: empData } = useEmployees({
        search: query.length >= 2 ? query : undefined,
        limit: 5,
    })
    const employees = query.length >= 2 ? (empData?.data ?? []) : []

    const { data: orgUnitsRaw = [] } = useOrgUnits()
    const orgMap = useMemo(() => buildOrgUnitMap(orgUnitsRaw), [orgUnitsRaw])

    const handleSelect = useCallback((path: string) => {
        navigate(path)
        onOpenChange(false)
        setQuery('')
    }, [navigate, onOpenChange])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault()
                onOpenChange(true)
            }
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [onOpenChange])

    const filtered = NAV_ITEMS.filter(
        (item) =>
            !query ||
            item.label.toLowerCase().includes(query.toLowerCase()) ||
            item.keywords.toLowerCase().includes(query.toLowerCase()),
    )

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <CommandInput
                placeholder="Search pages, employees..."
                value={query}
                onValueChange={setQuery}
            />
            <CommandList className="max-h-[400px]">
                <CommandEmpty>No results found.</CommandEmpty>

                <CommandGroup heading="Pages">
                    {filtered.map((item) => (
                        <CommandItem
                            key={item.path}
                            value={`${item.label} ${item.keywords}`}
                            onSelect={() => handleSelect(item.path)}
                            className="gap-2 cursor-pointer"
                        >
                            <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span>{item.label}</span>
                        </CommandItem>
                    ))}
                </CommandGroup>

                {employees.length > 0 && (
                    <>
                        <CommandSeparator />
                        <CommandGroup heading="Employees">
                            {employees.map((emp) => (
                                <CommandItem
                                    key={emp.id}
                                    value={`emp-${emp.id}`}
                                    onSelect={() => handleSelect(`/employees/${emp.id}`)}
                                    className="gap-2 cursor-pointer"
                                >
                                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <div className="min-w-0">
                                        <span className="block truncate">
                                            {emp.fullName ?? `${emp.firstName} ${emp.lastName}`}
                                        </span>
                                        {emp.designation && (
                                            <span className="block text-xs text-muted-foreground truncate mb-0.5">
                                                {emp.designation}
                                            </span>
                                        )}
                                        <OrgHierarchyPath parts={resolveOrgPath(orgMap, (emp as any).branchId, (emp as any).divisionId, (emp as any).departmentId ?? null)} />
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </>
                )}
            </CommandList>
        </CommandDialog>
    )
}
