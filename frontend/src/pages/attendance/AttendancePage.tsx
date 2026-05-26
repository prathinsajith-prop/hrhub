import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { type ColumnDef } from '@tanstack/react-table'
import {
    CalendarDays, Clock, UserCheck, UserX,
    AlarmClock, Home, CalendarOff, TrendingUp, Edit2, RefreshCcw, Zap, Fingerprint,
    Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download, X, Check,
    ArrowUpRight, ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts'

import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DatePicker } from '@/components/ui/date-picker'
import { toast } from '@/components/ui/overlays'
import {
    StatusBadge, EmptyState, TableSkeleton, InitialsAvatar,
    type StatusTone,
} from '@/components/shared'
import { ExportDropdown } from '@/components/shared/ExportDropdown'
import { EmployeeLink } from '@/components/shared/EmployeeLink'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { useAttendance, useAttendanceCalendar, useUpsertAttendance, useExternalPunch, useAddManualPunch, type AttendanceRecord } from '@/hooks/useAttendance'
import { AttendanceCalendarGrid } from '@/components/shared/AttendanceCalendarGrid'
import { AttendanceLegendPopover } from '@/components/shared/AttendanceLegend'
import { MonthSwitcher } from '@/components/shared/MonthSwitcher'
import { resolveMonthFromOffset } from '@/lib/monthRange'
import { useEmployees } from '@/hooks/useEmployees'
import { useBiometricMappings } from '@/hooks/useBiometric'
import { EmployeeSelect } from '@/components/shared/EmployeeSelect'
import { useOrgUnits } from '@/hooks/useOrgUnits'
import { usePermissions } from '@/hooks/usePermissions'
import { buildOrgUnitMap, resolveOrgPath } from '@/lib/orgUtils'
import { OrgHierarchyPath } from '@/components/shared/OrgHierarchyPath'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { applyClientFilters, buildFilterQueryString, type FilterConfig } from '@/lib/filters'
import { ATTENDANCE_STATUS_OPTIONS } from '@/lib/options'
import { exportAttendance } from '@/lib/export'
import { cn } from '@/lib/utils'

const ATTENDANCE_FILTERS: FilterConfig[] = [
    { name: 'employeeName', label: 'Employee', type: 'text', field: 'employeeName' },
    { name: 'status', label: 'Status', type: 'multi_select', field: 'status', options: ATTENDANCE_STATUS_OPTIONS },
    { name: 'date', label: 'Date', type: 'date_range', field: 'date' },
    { name: 'hoursWorked', label: 'Hours worked', type: 'number_range', field: 'hoursWorked', min: 0, max: 24 },
    { name: 'overtimeHours', label: 'Has overtime', type: 'toggle', field: 'overtimeHours' },
]

// ─────────────────────────── Domain config ───────────────────────────────

const STATUS_COLORS: Record<AttendanceRecord['status'], string> = {
    present: '#22c55e',
    absent: '#ef4444',
    half_day: '#eab308',
    late: '#f97316',
    wfh: '#3b82f6',
    on_leave: '#0ea5e9',
}

const STATUS_LABEL: Record<AttendanceRecord['status'], string> = {
    present: 'Present', absent: 'Absent', half_day: 'Half Day',
    late: 'Late', wfh: 'WFH', on_leave: 'On Leave',
}

const STATUS_TONE: Record<AttendanceRecord['status'], StatusTone> = {
    present: 'success',
    absent: 'danger',
    half_day: 'warning',
    late: 'orange',
    wfh: 'info',
    on_leave: 'purple',
}

const STATUS_ORDER: AttendanceRecord['status'][] = [
    'present', 'absent', 'late', 'wfh', 'half_day', 'on_leave',
]

// ─────────────────────────── Helpers ─────────────────────────────────────

function fmtTime(ts: string | undefined) {
    if (!ts) return '—'
    return new Date(ts).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Format a Date as the two pieces the external-punch form needs:
 *   - `date` is ISO `YYYY-MM-DD` (consumed by our shadcn DatePicker)
 *   - `time` is 24-h `HH:mm` (consumed by `<Input type="time">`)
 * Both default to "now" in the user's local time zone so HR rarely has to
 * change them.
 */
function nowDateTimePieces(d: Date = new Date()): { date: string; time: string } {
    const pad = (n: number) => String(n).padStart(2, '0')
    return {
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    }
}

// ─────────────────────────── Page ────────────────────────────────────────

export function AttendancePage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { can } = usePermissions()
    const canManage = can('manage_attendance')
    const [monthOffset, setMonthOffset] = useState(0)
    const [editing, setEditing] = useState<AttendanceRecord | null>(null)
    const [punchEmpId, setPunchEmpId] = useState('')
    const [punchType, setPunchType] = useState<'in' | 'out'>('in')
    const [punchDate, setPunchDate] = useState<string>(() => nowDateTimePieces().date)
    const [punchTime, setPunchTime] = useState<string>(() => nowDateTimePieces().time)
    // Punch-history filters. Date defaults to "today" so the table opens to
    // the most-relevant day; HR can step back via the DatePicker. Employee +
    // status default to "all".
    const [historyDate, setHistoryDate] = useState<string>(() => nowDateTimePieces().date)
    const [filterEmployee, setFilterEmployee] = useState('')
    const [filterStatus, setFilterStatus] = useState<'all' | AttendanceRecord['status']>('all')
    // Row-click opens a modal previewing the employee's full month of
    // attendance instead of leaving the page. The modal exposes a CTA to
    // navigate to their profile when HR actually needs the full record.
    const [attendanceModal, setAttendanceModal] = useState<{ id: string; name: string; avatarUrl: string | null } | null>(null)
    const externalPunch = useExternalPunch()
    const [importOpen, setImportOpen] = useState(false)

    const { month: calendarMonth, label, start, end } = useMemo(() => resolveMonthFromOffset(monthOffset), [monthOffset])
    const { data: calendarData, isLoading: calendarLoading } = useAttendanceCalendar(calendarMonth)

    const search = useSearchFilters({
        storageKey: 'hrhub.attendance.searchHistory',
        availableFilters: ATTENDANCE_FILTERS,
    })

    const statusApplied = search.appliedFilters.status
    const advancedStatus = Array.isArray(statusApplied?.value) ? undefined : (statusApplied?.value as string | undefined) || undefined

    // Build the server-side filter string from the advanced filter panel.
    // Single-value status is already forwarded via the `status` param, so exclude
    // it here to avoid a duplicate AND condition. Multi-select status (array value)
    // is NOT sent as the `status` param, so it must stay in the filter string.
    const filterStr = useMemo(() => {
        const isMultiStatus = Array.isArray(statusApplied?.value)
        if (!isMultiStatus) {
            const { status: _s, ...rest } = search.appliedFilters
            return buildFilterQueryString(rest) || undefined
        }
        return buildFilterQueryString(search.appliedFilters) || undefined
    }, [search.appliedFilters, statusApplied?.value])

    const { data: records, isLoading, refetch, isFetching } = useAttendance({
        startDate: start,
        endDate: end,
        status: advancedStatus,
        filter: filterStr,
        limit: 10000,
    })
    const { data: employeesData } = useEmployees({ limit: 100 })
    const { data: orgUnitsRaw = [] } = useOrgUnits()
    const orgMap = useMemo(() => buildOrgUnitMap(orgUnitsRaw), [orgUnitsRaw])
    const upsert = useUpsertAttendance()

    const list = useMemo<AttendanceRecord[]>(
        () => {
            if (!records) return []
            // Backend now returns { items, nextCursor, total? }; tolerate the
            // legacy array shape so older deployed APIs still work.
            if (Array.isArray(records)) return records as AttendanceRecord[]
            return Array.isArray(records.items) ? records.items : []
        },
        [records],
    )
    // employees response shape may be { data: [] } or []
    const empList = useMemo<Array<Record<string, unknown> & { id: string }>>(() => {
        if (Array.isArray(employeesData)) return employeesData as Array<Record<string, unknown> & { id: string }>
        const maybe = (employeesData as { data?: unknown })?.data
        return Array.isArray(maybe) ? (maybe as Array<Record<string, unknown> & { id: string }>) : []
    }, [employeesData])

    // O(1) employee lookup instead of empList.find() per row
    const empMap = useMemo(() => {
        const m = new Map<string, { name: string; initials: string; department?: string; branchId?: string; divisionId?: string; departmentId?: string; avatarUrl?: string }>()
        for (const e of empList) {
            const fullName = (e.fullName as string | undefined)
                ?? `${(e.firstName as string | undefined) ?? ''} ${(e.lastName as string | undefined) ?? ''}`.trim()
            const name = fullName || '—'
            m.set(e.id, {
                name,
                initials: name
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((s) => s[0])
                    .join('')
                    .toUpperCase() || '—',
                department: e.department as string | undefined,
                branchId: e.branchId as string | undefined,
                divisionId: e.divisionId as string | undefined,
                departmentId: e.departmentId as string | undefined,
                avatarUrl: (e.avatarUrl as string | undefined) ?? (e.photoUrl as string | undefined),
            })
        }
        return m
    }, [empList])

    const attendanceClientFilters = useMemo(() => {
        if (Array.isArray(statusApplied?.value)) return search.appliedFilters
        const { status: _s, ...rest } = search.appliedFilters
        return rest
    }, [search.appliedFilters, statusApplied?.value])
    const filteredAttendance = useMemo(
        () => applyClientFilters(list as unknown as Record<string, unknown>[], {
            searchInput: search.searchInput,
            appliedFilters: attendanceClientFilters,
            searchFields: ['employeeName', 'employeeNo', 'employeeDepartment', 'status'],
            fieldAccessors: {
                overtimeHours: (row) => parseFloat(String(row.overtimeHours ?? '0')) > 0,
            },
        }) as unknown as AttendanceRecord[],
        [list, attendanceClientFilters, search.searchInput],
    )
    // Punch-history view shows only the day + employee + status the user
    // picked. Built on top of the existing filter chain so the advanced
    // filter system still feeds into it.
    const historyRows = useMemo(
        () => filteredAttendance.filter((r) => {
            if (r.date !== historyDate) return false
            if (filterEmployee && r.employeeId !== filterEmployee) return false
            if (filterStatus !== 'all' && r.status !== filterStatus) return false
            return true
        }),
        [filteredAttendance, historyDate, filterEmployee, filterStatus],
    )

    const summary = useMemo(() => {
        const counts: Record<string, number> = {
            present: 0, absent: 0, late: 0, wfh: 0, half_day: 0, on_leave: 0,
        }
        let totalHours = 0, totalOT = 0
        for (const r of list) {
            counts[r.status] = (counts[r.status] ?? 0) + 1
            totalHours += parseFloat(r.hoursWorked ?? '0')
            totalOT += parseFloat(r.overtimeHours ?? '0')
        }
        return { counts, totalHours, totalOT, totalRecords: list.length }
    }, [list])

    const pieData = useMemo(
        () =>
            STATUS_ORDER
                .map((key) => ({
                    name: STATUS_LABEL[key],
                    value: summary.counts[key] ?? 0,
                    color: STATUS_COLORS[key],
                }))
                .filter((d) => d.value > 0),
        [summary],
    )

    const dailyData = useMemo(() => {
        const map = new Map<string, { date: string; present: number; absent: number; late: number; hours: number }>()
        for (const r of list) {
            let row = map.get(r.date)
            if (!row) {
                row = { date: r.date, present: 0, absent: 0, late: 0, hours: 0 }
                map.set(r.date, row)
            }
            if (r.status === 'present') row.present++
            else if (r.status === 'absent') row.absent++
            else if (r.status === 'late') row.late++
            row.hours += parseFloat(r.hoursWorked ?? '0')
        }
        return [...map.values()]
            .toSorted((a, b) => a.date.localeCompare(b.date))
            .map((d) => ({ ...d, date: d.date.slice(5) }))
    }, [list])

    const empSummary = useMemo(() => {
        const map = new Map<string, { empId: string; name: string; present: number; absent: number; hours: number; ot: number }>()
        for (const r of list) {
            let row = map.get(r.employeeId)
            if (!row) {
                const emp = empMap.get(r.employeeId)
                row = {
                    empId: r.employeeId,
                    name: emp?.name ?? '—',
                    present: 0, absent: 0, hours: 0, ot: 0,
                }
                map.set(r.employeeId, row)
            }
            if (r.status === 'present') row.present++
            else if (r.status === 'absent') row.absent++
            row.hours += parseFloat(r.hoursWorked ?? '0')
            row.ot += parseFloat(r.overtimeHours ?? '0')
        }
        return [...map.values()].toSorted((a, b) => b.hours - a.hours)
    }, [list, empMap])

    const handleEdit = useCallback(
        (rec: AttendanceRecord) => {
            setEditing(rec)
        },
        [],
    )

    const handleExport = useCallback(() => {
        if (!list.length) {
            toast.warning('Nothing to export', 'No records in the current view.')
            return
        }
        const header = ['Date', 'Employee', 'Status', 'Punch In', 'Punch Out', 'Hours', 'Overtime', 'Notes']
        const rows = list.map((r) => [
            r.date,
            empMap.get(r.employeeId)?.name ?? '—',
            STATUS_LABEL[r.status as keyof typeof STATUS_LABEL],
            fmtTime(r.checkIn),
            fmtTime(r.checkOut),
            r.hoursWorked ?? '',
            r.overtimeHours ?? '',
            (r.notes ?? '').replace(/"/g, '""'),
        ])
        const csv = [header, ...rows].map((cols) =>
            cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
        ).join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `attendance-${start}_to_${end}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Exported', `${list.length} rows exported to CSV.`)
    }, [list, empMap, start, end])

    // ─── Columns ───────────────────────────────────────────────────
    const columns: ColumnDef<AttendanceRecord>[] = useMemo(() => [
        {
            accessorKey: 'date',
            header: 'Date',
            cell: ({ getValue }) => {
                const d = getValue() as string
                return (
                    <span className="font-mono text-[11px] text-muted-foreground">{d}</span>
                )
            },
            size: 110,
        },
        {
            id: 'employee',
            header: 'Employee',
            accessorFn: (row) => row.employeeName ?? empMap.get(row.employeeId)?.name ?? '—',
            cell: ({ row: { original: r } }) => {
                const emp = empMap.get(r.employeeId)
                const name = r.employeeName ?? emp?.name ?? '—'
                const avatar = r.employeeAvatarUrl ?? emp?.avatarUrl
                const orgParts = resolveOrgPath(orgMap, emp?.branchId, emp?.divisionId, emp?.departmentId)
                const hasParts = orgParts.some(Boolean)
                return (
                    <div className="flex items-center gap-2.5 min-w-0">
                        <InitialsAvatar name={name} src={avatar} size="sm" />
                        <div className="min-w-0">
                            <EmployeeLink id={r.employeeId} name={name} className="text-sm font-medium truncate block" />
                            {r.employeeNo && (
                                <p className="text-[11px] text-muted-foreground truncate">{r.employeeNo}</p>
                            )}
                            {hasParts
                                ? <OrgHierarchyPath parts={orgParts} />
                                : r.employeeDepartment && (
                                    <p className="text-[11px] text-muted-foreground truncate">{r.employeeDepartment}</p>
                                )
                            }
                        </div>
                    </div>
                )
            },
            size: 240,
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ getValue }) => {
                const s = getValue() as AttendanceRecord['status']
                return (
                    <StatusBadge tone={STATUS_TONE[s]} dot>
                        {STATUS_LABEL[s]}
                    </StatusBadge>
                )
            },
            size: 110,
        },
        {
            accessorKey: 'checkIn',
            header: 'Punch In',
            cell: ({ getValue }) => (
                <span className="font-mono text-[11px] text-green-700 dark:text-green-400">
                    {fmtTime(getValue() as string | undefined)}
                </span>
            ),
            size: 90,
        },
        {
            accessorKey: 'checkOut',
            header: 'Punch Out',
            cell: ({ getValue }) => (
                <span className="font-mono text-[11px] text-red-700 dark:text-red-400">
                    {fmtTime(getValue() as string | undefined)}
                </span>
            ),
            size: 90,
        },
        {
            accessorKey: 'hoursWorked',
            header: () => <div className="text-right">Hours</div>,
            cell: ({ getValue }) => {
                const h = getValue() as string | undefined
                return (
                    <div className="text-right tabular-nums text-sm">
                        {h ? `${parseFloat(h).toFixed(1)}h` : '—'}
                    </div>
                )
            },
            size: 80,
        },
        {
            accessorKey: 'overtimeHours',
            header: () => <div className="text-right">Overtime</div>,
            cell: ({ getValue }) => {
                const v = getValue() as string | undefined
                const n = v ? parseFloat(v) : 0
                return (
                    <div className="text-right tabular-nums text-sm">
                        {n > 0 ? (
                            <span className="text-info font-semibold">
                                {n.toFixed(1)}h
                            </span>
                        ) : '—'}
                    </div>
                )
            },
            size: 90,
        },
        {
            accessorKey: 'notes',
            header: 'Notes',
            cell: ({ getValue }) => (
                <span className="text-xs text-muted-foreground line-clamp-1">
                    {(getValue() as string) || '—'}
                </span>
            ),
            size: 160,
        },
        {
            id: 'actions',
            header: '',
            cell: ({ row }) => (
                <div className="flex justify-end">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1.5"
                        onClick={() => handleEdit(row.original)}
                    >
                        <Edit2 className="size-3" />
                        Edit
                    </Button>
                </div>
            ),
            size: 80,
        },
    ], [empMap, orgMap, handleEdit])

    return (
        <PageWrapper>
            <PageHeader
                eyebrow="Operations"
                title={t('attendance.title')}
                description={t('attendance.description')}
                actions={
                    <div className="flex items-center gap-2">
                        <MonthSwitcher offset={monthOffset} onChange={setMonthOffset} label={label} />
                        {can('manage_attendance') && (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setImportOpen(true)}
                                    className="gap-1.5"
                                    title={t('attendance.importEntries', 'Import attendance entries') as string}
                                >
                                    <Upload className="size-3.5" />
                                    {t('attendance.importAction', 'Import')}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate('/attendance/biometric')}
                                    className="gap-1.5"
                                    title={t('attendance.biometricImport', 'Biometric mapping & punch import') as string}
                                >
                                    <Fingerprint className="size-3.5" />
                                    {t('attendance.integrationsAction', 'Integrations')}
                                </Button>
                            </>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<RefreshCcw className={isFetching ? 'size-3.5 animate-spin' : 'size-3.5'} />}
                            onClick={() => refetch()}
                            disabled={isFetching}
                        >
                            Refresh
                        </Button>
                        <ExportDropdown
                            onExportCsv={handleExport}
                            onExportPdf={() => exportAttendance({ format: 'pdf', startDate: start, endDate: end }).catch(() => toast.error('Export failed', 'Could not download PDF report.'))}
                        />
                    </div>
                }
            />

            <Tabs defaultValue="summary" className="space-y-4">
                {/* Underlined-tab pattern (Material / GitHub style): bold primary
                    text + 2-px accent bar at the bottom of the active tab reads
                    unambiguously as "selected" without relying on a faint
                    background tint. */}
                <TabsList className="bg-background border-b border-border rounded-none h-auto p-0 gap-0 w-full justify-start flex-wrap">
                    {([
                        { value: 'summary',         label: t('attendance.tabs.summary', 'Summary') },
                        { value: 'punch-history',   label: t('attendance.tabs.punchHistory', 'Punch history') },
                        { value: 'calendar',        label: t('attendance.tabs.calendar', 'Calendar view') },
                        ...(canManage ? [{ value: 'external-punch', label: t('attendance.tabs.externalPunch', 'External Punch') }] : []),
                    ] as const).map((tab) => (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            className={cn(
                                'rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground -mb-px',
                                'shadow-none transition-colors hover:text-foreground',
                                'data-[state=active]:border-primary data-[state=active]:text-primary',
                                'data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none',
                            )}
                        >
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="summary" className="space-y-4 mt-4">
                    {/* KPI strip - 8 tiles */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-3">
                <KpiCardCompact
                    label={STATUS_LABEL.present}
                    value={summary.counts.present ?? 0}
                    color="green"
                    icon={UserCheck}
                />
                <KpiCardCompact
                    label={STATUS_LABEL.absent}
                    value={summary.counts.absent ?? 0}
                    color="red"
                    icon={UserX}
                />
                <KpiCardCompact
                    label={STATUS_LABEL.late}
                    value={summary.counts.late ?? 0}
                    color="amber"
                    icon={AlarmClock}
                />
                <KpiCardCompact
                    label={STATUS_LABEL.wfh}
                    value={summary.counts.wfh ?? 0}
                    color="blue"
                    icon={Home}
                />
                <KpiCardCompact
                    label={STATUS_LABEL.half_day}
                    value={summary.counts.half_day ?? 0}
                    color="amber"
                    icon={Clock}
                />
                <KpiCardCompact
                    label={STATUS_LABEL.on_leave}
                    value={summary.counts.on_leave ?? 0}
                    color="cyan"
                    icon={CalendarOff}
                />
                <KpiCardCompact
                    label="Total Hours"
                    value={`${summary.totalHours.toFixed(0)}h`}
                    color="blue"
                    icon={Clock}
                />
                <KpiCardCompact
                    label="Overtime"
                    value={`${summary.totalOT.toFixed(0)}h`}
                    color="cyan"
                    icon={TrendingUp}
                />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{t('attendance.statusDistribution')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {pieData.length === 0 ? (
                            <EmptyState
                                icon={CalendarDays}
                                title="No status data"
                                description="No attendance entries in the selected month."
                            />
                        ) : (
                            <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        dataKey="value"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={45}
                                        outerRadius={80}
                                        paddingAngle={2}
                                    >
                                        {pieData.map((entry, i) => (
                                            <Cell key={i} fill={entry.color} strokeWidth={0} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{
                                            fontSize: 12,
                                            borderRadius: 8,
                                            border: '1px solid hsl(var(--border))',
                                        }}
                                    />
                                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
                <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{t('attendance.dailyTrend')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {dailyData.length === 0 ? (
                            <EmptyState
                                icon={TrendingUp}
                                title="No trend data"
                                description="Data will appear as daily entries are recorded."
                            />
                        ) : (
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={dailyData} margin={{ left: -20, right: 8, top: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                                    <Tooltip
                                        contentStyle={{
                                            fontSize: 12,
                                            borderRadius: 8,
                                            border: '1px solid hsl(var(--border))',
                                        }}
                                    />
                                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                                    <Line type="monotone" dataKey="present" stroke={STATUS_COLORS.present} strokeWidth={2} dot={false} name="Present" />
                                    <Line type="monotone" dataKey="absent" stroke={STATUS_COLORS.absent} strokeWidth={2} dot={false} name="Absent" />
                                    <Line type="monotone" dataKey="late" stroke={STATUS_COLORS.late} strokeWidth={2} dot={false} name="Late" />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Hours by employee */}
            {empSummary.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{t('attendance.hoursByEmployee')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={empSummary.slice(0, 15)} margin={{ left: -20, right: 8, top: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                                <Tooltip
                                    formatter={(v) => `${Number(v).toFixed(1)}h`}
                                    contentStyle={{
                                        fontSize: 12,
                                        borderRadius: 8,
                                        border: '1px solid hsl(var(--border))',
                                    }}
                                />
                                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="hours" fill="hsl(var(--primary))" name="Regular" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="ot" fill="hsl(var(--info))" name="Overtime" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}
                </TabsContent>

                <TabsContent value="external-punch" className="space-y-4 mt-4">
                    {/* External punch - HR only */}
                    {canManage && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-1.5">
                            <Zap className="size-3.5 text-amber-500" />
                            External Punch
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">Manually record a punch-in or punch-out for an employee (biometric / device integration).</p>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="space-y-1.5 flex-1 min-w-40">
                                <Label className="text-xs">Employee *</Label>
                                <EmployeeSelect
                                    value={punchEmpId}
                                    onValueChange={setPunchEmpId}
                                    clearable
                                />
                            </div>
                            <div className="space-y-1.5 w-32">
                                <Label className="text-xs">Punch type *</Label>
                                <Select value={punchType} onValueChange={(v) => setPunchType(v as 'in' | 'out')}>
                                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="in">Punch In</SelectItem>
                                        <SelectItem value="out">Punch Out</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                    <Label className="text-xs">Punch time</Label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const now = nowDateTimePieces()
                                            setPunchDate(now.date)
                                            setPunchTime(now.time)
                                        }}
                                        className="text-[10px] font-medium text-primary hover:underline"
                                    >
                                        Now
                                    </button>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <DatePicker
                                        value={punchDate}
                                        onChange={(v) => setPunchDate(v)}
                                        className="w-40"
                                    />
                                    <Input
                                        type="time"
                                        value={punchTime}
                                        onChange={(e) => setPunchTime(e.target.value)}
                                        className="h-9 w-28 text-sm tabular-nums"
                                    />
                                </div>
                            </div>
                            <Button
                                size="sm"
                                loading={externalPunch.isPending}
                                disabled={!punchEmpId}
                                onClick={() => {
                                    // Build an ISO timestamp from the (date, time) pair. The DatePicker
                                    // and `<input type="time">` both emit local-time strings, so we
                                    // combine into the local Date and toISOString() applies the offset.
                                    const combinedIso = (punchDate && punchTime)
                                        ? new Date(`${punchDate}T${punchTime}`).toISOString()
                                        : undefined
                                    externalPunch.mutate(
                                        {
                                            employeeId: punchEmpId,
                                            punchType,
                                            timestamp: combinedIso,
                                            source: 'hr_manual',
                                        },
                                        {
                                            onSuccess: () => {
                                                toast.success('Punch recorded', `Punch-${punchType} logged successfully.`)
                                                setPunchEmpId('')
                                                const now = nowDateTimePieces()
                                                setPunchDate(now.date)
                                                setPunchTime(now.time)
                                            },
                                            onError: () => toast.error('Punch failed', 'Could not record the punch. Please try again.'),
                                        },
                                    )
                                }}
                            >
                                <Zap className="size-3.5 mr-1.5" />
                                Record punch
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
                </TabsContent>

                <TabsContent value="calendar" className="space-y-4 mt-4">
                    {/* Monthly calendar grid (HR / dept_head whole-team view) */}
                    <Card>
                        <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
                            <div className="min-w-0">
                                <CardTitle className="text-base">Calendar view</CardTitle>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Day-by-day status for every employee in {label}.
                                </p>
                            </div>
                            <AttendanceLegendPopover />
                        </CardHeader>
                        <CardContent>
                            <AttendanceCalendarGrid data={calendarData} loading={calendarLoading} showLegend={false} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="punch-history" className="space-y-4 mt-4">
                    {/* Records */}
                    <Card>
                <CardHeader className="flex-row items-start sm:items-center justify-between gap-3 flex-wrap pb-4">
                    <div>
                        <CardTitle className="text-base">Punch history</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {historyRows.length} record{historyRows.length === 1 ? '' : 's'} on {historyDate}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <DatePicker
                            value={historyDate}
                            onChange={(v) => setHistoryDate(v || nowDateTimePieces().date)}
                            className="w-44"
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setHistoryDate(nowDateTimePieces().date)}
                        >
                            Today
                        </Button>
                        <EmployeeSelect
                            value={filterEmployee}
                            onValueChange={setFilterEmployee}
                            placeholder="All employees"
                            clearable
                            className="h-8 text-xs w-48"
                        />
                        <Select
                            value={filterStatus}
                            onValueChange={(v) => setFilterStatus(v as 'all' | AttendanceRecord['status'])}
                        >
                            <SelectTrigger className="h-8 text-xs w-36">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All statuses</SelectItem>
                                {STATUS_ORDER.map((s) => (
                                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <TableSkeleton columns={8} rows={8} />
                    ) : historyRows.length === 0 ? (
                        <EmptyState
                            icon={CalendarDays}
                            title={t('attendance.noRecords')}
                            description={`No attendance records on ${historyDate}.`}
                        />
                    ) : (
                        <DataTable
                            columns={columns}
                            data={historyRows}
                            pageSize={10}
                            emptyMessage={t('attendance.noRecords')}
                            onRowClick={(row) => {
                                const emp = empMap.get(row.employeeId)
                                setAttendanceModal({
                                    id: row.employeeId,
                                    name: row.employeeName ?? emp?.name ?? '—',
                                    // Prefer the row's avatar URL (already resolved by the
                                    // attendance endpoint), fall back to the empMap entry
                                    // (resolved by the employees list endpoint) so the
                                    // user-uploaded image shows up either way.
                                    avatarUrl: row.employeeAvatarUrl ?? emp?.avatarUrl ?? null,
                                })
                            }}
                        />
                    )}
                </CardContent>
            </Card>
                </TabsContent>
            </Tabs>

            <EmployeeMonthAttendanceDialog
                state={attendanceModal}
                onClose={() => setAttendanceModal(null)}
                initialMonth={calendarMonth}
                onViewProfile={(id) => {
                    setAttendanceModal(null)
                    navigate(`/employees/${id}`)
                }}
            />

            <EditAttendanceDialog
                key={editing?.id ?? 'none'}
                record={editing}
                onClose={() => setEditing(null)}
                employeeName={
                    editing
                        ? (editing.employeeName ?? empMap.get(editing.employeeId)?.name ?? '—')
                        : ''
                }
                onSave={async (patch) => {
                    if (!editing) return
                    try {
                        await upsert.mutateAsync({
                            employeeId: editing.employeeId,
                            date: editing.date,
                            status: patch.status,
                            checkIn: patch.checkIn || undefined,
                            checkOut: patch.checkOut || undefined,
                            notes: patch.notes || undefined,
                        })
                        toast.success('Attendance updated', `${editing.date} saved.`)
                        setEditing(null)
                    } catch (err: unknown) {
                        toast.error('Update failed', (err as { message?: string })?.message ?? 'Could not save attendance.')
                    }
                }}
                saving={upsert.isPending}
            />

            {importOpen && (
                <ImportAttendancePunchesDialog
                    open={importOpen}
                    onOpenChange={setImportOpen}
                    employees={empList.map((e) => {
                        const m = empMap.get(e.id)
                        return {
                            id: e.id,
                            name: m?.name ?? '—',
                            employeeNo: (e.employeeNo as string | undefined) ?? null,
                            avatarUrl: m?.avatarUrl ?? null,
                        }
                    })}
                />
            )}
        </PageWrapper>
    )
}

// ─── Employee Month-Attendance Dialog ─────────────────────────────
//
// Opens when HR clicks a punch-history row. Shows the employee's current-
// month calendar slice + summary KPIs, with a CTA to jump to their full
// profile when they need more than the at-a-glance view.

interface EmployeeMonthAttendanceDialogProps {
    state: { id: string; name: string; avatarUrl: string | null } | null
    onClose: () => void
    /** Initial month (YYYY-MM) shown when the dialog opens — taken from the
     *  parent page's selected month. The dialog then owns its own month state
     *  so HR can navigate prev/next without disturbing the page underneath. */
    initialMonth: string
    onViewProfile: (id: string) => void
}

function EmployeeMonthAttendanceDialog({
    state, onClose, initialMonth, onViewProfile,
}: EmployeeMonthAttendanceDialogProps) {
    const open = !!state

    // ─── Dialog-local month state ──────────────────────────────────────
    // The parent's `calendarData` carries one month at a time; if HR wants
    // to scrub through history without leaving the dialog, we need our own
    // month + our own fetch. State-during-render reset (CLAUDE.md pattern):
    // when the dialog opens for a different employee, snap back to the
    // page's current month so the first view matches the row HR clicked.
    const [month, setMonth] = useState(initialMonth)
    const [lastEmployeeId, setLastEmployeeId] = useState<string | null>(null)
    const currentEmployeeId = state?.id ?? null
    if (open && currentEmployeeId !== lastEmployeeId) {
        setLastEmployeeId(currentEmployeeId)
        setMonth(initialMonth)
    } else if (!open && lastEmployeeId !== null) {
        setLastEmployeeId(null)
    }

    // Scope the calendar fetch to this employee + the dialog's month. We
    // pass `employeeId` so the server only returns one employee's cells,
    // not the entire tenant — much smaller payload while the dialog is
    // open. The hook is no-op when the dialog is closed (employeeId is
    // null), so we don't fetch in the background.
    const { data: calendarData, isLoading } = useAttendanceCalendar(month, {
        employeeId: currentEmployeeId ?? undefined,
    })

    // Slice to the picked employee. The /calendar endpoint may include
    // other employees when `employeeId` isn't passed (legacy hook
    // signature), so we filter defensively.
    const employeeSlice = useMemo(() => {
        if (!state || !calendarData) return undefined
        const emp = calendarData.employees.find((e) => e.id === state.id)
        if (!emp) return undefined
        return { ...calendarData, employees: [emp] }
    }, [state, calendarData])
    const employee = employeeSlice?.employees[0]

    // Pretty label for the chosen month — used in the header subtitle and
    // the section heading. Built off the YYYY-MM string so it stays in
    // sync with whatever the user picks.
    const monthLabel = useMemo(() => {
        const [yStr, mStr] = month.split('-')
        const y = Number(yStr); const m = Number(mStr)
        if (!Number.isFinite(y) || !Number.isFinite(m)) return month
        return new Date(y, m - 1, 1).toLocaleString('en-AE', { month: 'long', year: 'numeric' })
    }, [month])

    // Prev / next month navigation. We work in YYYY-MM space (UTC-safe,
    // no timezone surprises) — Date math at the local boundary would shift
    // the displayed month for users in negative-offset timezones.
    const shiftMonth = useCallback((delta: number) => {
        setMonth((current) => {
            const [yStr, mStr] = current.split('-')
            const y = Number(yStr); const m = Number(mStr)
            if (!Number.isFinite(y) || !Number.isFinite(m)) return current
            const d = new Date(y, m - 1 + delta, 1)
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        })
    }, [])

    // Disable "Next" once we're at the current month — we don't show
    // future attendance and the empty calendar would be confusing.
    const currentMonthIso = useMemo(() => {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }, [])
    const canGoNext = month < currentMonthIso
    // Per-status counts from the same cells the grid renders — keeps the
    // summary perfectly consistent with what the user sees in the calendar.
    const counts = useMemo(() => {
        const acc = { present: 0, late: 0, absent: 0, leave: 0, wfh: 0, holiday: 0, weekOff: 0, other: 0 }
        if (!employee) return acc
        for (const c of employee.cells) {
            if (!c.code) continue
            // 'IP' (In Progress, still checked in today) counts as Present
            // for the headline KPI — the employee is on shift, just hasn't
            // punched out yet. 'INC' (Incomplete, past day missing checkout)
            // still counts as Absent so HR sees the impact on attendance
            // until they close out the day. Both are distinct hues on the
            // grid so HR can tell them apart visually.
            if (c.code === 'P' || c.code === 'IP') acc.present++
            else if (c.code === 'P-late' || c.code === 'P-short') acc.late++
            else if (c.code === 'A' || c.code === 'INC') acc.absent++
            else if (['AL', 'SL', 'ML', 'PL', 'BL', 'HJ'].includes(c.code)) acc.leave++
            else if (c.code === 'WFH') acc.wfh++
            else if (c.code === 'H') acc.holiday++
            else if (c.code === 'WO') acc.weekOff++
            else acc.other++
        }
        return acc
    }, [employee])

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-6 pt-5 pb-3 border-b">
                    <div className="flex items-start justify-between gap-3 pe-8">
                        <div className="flex items-center gap-3 min-w-0">
                            {/* Avatar source order: state.avatarUrl (resolved on the
                                punch-history row click) → calendar-slice avatarUrl →
                                initials fallback. Ensures the user-uploaded photo
                                appears whether or not the calendar slice has resolved. */}
                            <InitialsAvatar
                                name={employee?.name ?? state?.name ?? '—'}
                                src={state?.avatarUrl ?? employee?.avatarUrl ?? undefined}
                                size="lg"
                            />
                            <div className="min-w-0">
                                <DialogTitle className="truncate text-base">
                                    {employee?.name ?? state?.name ?? '—'}
                                </DialogTitle>
                                <p className="text-xs text-muted-foreground truncate">
                                    {employee?.designation ?? employee?.department ?? 'Attendance summary'}
                                </p>
                            </div>
                        </div>
                        {state ? (
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 shrink-0"
                                onClick={() => onViewProfile(state.id)}
                            >
                                <ArrowUpRight className="size-3.5" />
                                View profile
                            </Button>
                        ) : null}
                    </div>

                    {/* Month navigator — Prev / label / Next. Lives inside the
                        modal so HR can scrub through months without closing
                        the dialog (and without dragging the page header
                        underneath along with them). Disabled when there's
                        no employee selected yet, and "Next" is gated to the
                        current month so HR can't peek into empty future
                        months. */}
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-2 py-1">
                        <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => shiftMonth(-1)}
                            disabled={!state}
                            aria-label="Previous month"
                        >
                            <ChevronLeft className="size-4" />
                        </Button>
                        <span className="text-sm font-semibold tabular-nums">
                            {monthLabel}
                        </span>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => shiftMonth(1)}
                            disabled={!state || !canGoNext}
                            aria-label="Next month"
                        >
                            <ChevronRight className="size-4" />
                        </Button>
                    </div>
                </DialogHeader>
                <div className="overflow-y-auto px-6 py-4 space-y-4">
                    {/* KPI strip */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                        <KpiCardCompact label="Present" value={counts.present} color="green" icon={UserCheck} />
                        <KpiCardCompact label="Late" value={counts.late} color="amber" icon={AlarmClock} />
                        <KpiCardCompact label="Absent" value={counts.absent} color="red" icon={UserX} />
                        <KpiCardCompact label="Leave" value={counts.leave} color="cyan" icon={CalendarOff} />
                        <KpiCardCompact label="WFH" value={counts.wfh} color="blue" icon={Home} />
                        <KpiCardCompact label="Holiday" value={counts.holiday} color="red" icon={CalendarDays} />
                        <KpiCardCompact label="Week Off" value={counts.weekOff} color="amber" icon={Clock} />
                    </div>
                    {/* Original tabular grid (one row, 31 cells) in compact mode so a
                        full month fits without horizontal scroll. */}
                    {employeeSlice || isLoading ? (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    {monthLabel}
                                </h3>
                                <AttendanceLegendPopover />
                            </div>
                            <AttendanceCalendarGrid
                                data={employeeSlice}
                                loading={isLoading}
                                hideEmployeeColumn
                                showLegend={false}
                                compact
                            />
                        </div>
                    ) : (
                        <EmptyState
                            icon={CalendarDays}
                            title="No attendance loaded"
                            description="This employee has no attendance records in the selected month."
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}


// ─── Edit Attendance Dialog ───────────────────────────────────────
function toLocalDateTimeInput(iso?: string): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const tz = d.getTimezoneOffset() * 60000
    return new Date(d.getTime() - tz).toISOString().slice(0, 16)
}

function EditAttendanceDialog({
    record, onClose, employeeName, onSave, saving,
}: {
    record: AttendanceRecord | null
    onClose: () => void
    employeeName: string
    onSave: (patch: { status: AttendanceRecord['status']; checkIn: string; checkOut: string; notes: string }) => void
    saving: boolean
}) {
    const [status, setStatus] = useState<AttendanceRecord['status']>(record?.status ?? 'present')
    const [checkIn, setCheckIn] = useState(() => toLocalDateTimeInput(record?.checkIn))
    const [checkOut, setCheckOut] = useState(() => toLocalDateTimeInput(record?.checkOut))
    const [notes, setNotes] = useState(record?.notes ?? '')

    return (
        <Dialog open={!!record} onOpenChange={(o) => { if (!o) onClose() }}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Edit attendance</DialogTitle>
                    <p className="text-xs text-muted-foreground">
                        {employeeName} · {record?.date}
                    </p>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="att-status" className="text-xs">Status</Label>
                        <Select value={status} onValueChange={(v) => setStatus(v as AttendanceRecord['status'])}>
                            <SelectTrigger id="att-status" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ATTENDANCE_STATUS_OPTIONS.map(o => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="att-in" className="text-xs">Punch in</Label>
                            <Input
                                id="att-in"
                                type="datetime-local"
                                value={checkIn}
                                onChange={(e) => setCheckIn(e.target.value)}
                                className="h-9"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="att-out" className="text-xs">Punch out</Label>
                            <Input
                                id="att-out"
                                type="datetime-local"
                                value={checkOut}
                                onChange={(e) => setCheckOut(e.target.value)}
                                className="h-9"
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="att-notes" className="text-xs">Notes</Label>
                        <Input
                            id="att-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Optional"
                            className="h-9"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => onSave({
                            status,
                            checkIn: checkIn ? new Date(checkIn).toISOString() : '',
                            checkOut: checkOut ? new Date(checkOut).toISOString() : '',
                            notes,
                        })}
                        disabled={saving}
                    >
                        {saving ? 'Saving…' : 'Save changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Import Attendance Punches Dialog ─────────────────────────────────────

interface ImportRow {
    rowNum: number
    date: string
    inTime: string
    outTime: string | null
    inNotes: string | null
    outNotes: string | null
    locationName: string | null
    /** Whatever the CSV's `mapper_id` / `employee_no` column held — the raw
     *  lookup token before resolution. Stays available for error messages
     *  even after a successful resolve. */
    employeeKey: string | null
    employeeId: string | null
    errors: string[]
}

/** ImportRow after the resolver pass — populated employeeId + display fields. */
interface ResolvedImportRow extends ImportRow {
    resolvedName: string | null
    resolvedAvatarUrl: string | null
    resolvedVia: 'employee_no' | 'mapper_id' | null
}

function ImportAttendancePunchesDialog({
    open, onOpenChange, employees,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    employees: Array<{ id: string; name: string; employeeNo: string | null; avatarUrl: string | null }>
}) {
    const [fileName, setFileName] = useState<string | null>(null)
    const [fileSize, setFileSize] = useState<number>(0)
    const [rows, setRows] = useState<ImportRow[]>([])
    const [submitting, setSubmitting] = useState(false)
    const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 })
    /** Drag-over visual state — drives the dashed border highlight on the
     *  drop zone so the user knows the drop will be accepted. */
    const [dragOver, setDragOver] = useState(false)
    const addManual = useAddManualPunch()
    // Biometric mappings let rows reference an external device user id
    // instead of the HRHub employee_no — same dual-key import that the
    // /attendance/biometric page supports.
    const { data: mappings } = useBiometricMappings()

    /**
     * Build a single lookup map keyed by lowercase employee_no OR mapper_id.
     * Each entry carries the resolved employee id + display name so per-row
     * validation can populate `employeeId` AND render the canonical name in
     * the preview table without a second walk.
     *
     * Both keys live in the same map because either can resolve a row — and
     * the values they point to don't conflict in practice (a mapper_id like
     * "101" can coexist with an employee_no like "EMP-101"; the lookup falls
     * back to the one the user actually supplied).
     */
    const lookup = useMemo(() => {
        const m = new Map<string, { id: string; name: string; avatarUrl: string | null; via: 'employee_no' | 'mapper_id' }>()
        // Side index from employeeId → avatar so mapper_id hits (which
        // come from the mappings table, not `employees`) can still pick up
        // the right avatar to render in the preview.
        const avatarByEmpId = new Map<string, string | null>()
        for (const e of employees) {
            avatarByEmpId.set(e.id, e.avatarUrl)
            if (e.employeeNo) {
                m.set(e.employeeNo.trim().toLowerCase(), {
                    id: e.id, name: e.name, avatarUrl: e.avatarUrl, via: 'employee_no',
                })
            }
        }
        for (const map of mappings ?? []) {
            // mapper_id wins over a coincidental employee_no match only when
            // the user supplied it explicitly — see resolveImportRow below.
            m.set(map.mapperId.trim().toLowerCase(), {
                id: map.employeeId,
                name: map.employeeName,
                avatarUrl: avatarByEmpId.get(map.employeeId) ?? null,
                via: 'mapper_id',
            })
        }
        return m
    }, [employees, mappings])

    // `lookup` is a fresh Map on every change to `employees` / `mappings`
    // (built inside the useMemo above), so its reference flips automatically
    // when the data finishes loading. That makes the bookkeeping counter
    // and `lastSize` unnecessary — the useMemo below will recompute on its
    // own as soon as the lookup identity changes.
    const resolvedRows = useMemo(
        () => rows.map((r) => resolveImportRow(r, lookup)),
        [rows, lookup],
    )

    const validCount = resolvedRows.filter((r) => r.errors.length === 0).length
    const errorCount = resolvedRows.length - validCount
    const canImport = validCount > 0 && !submitting

    function reset() {
        setFileName(null)
        setFileSize(0)
        setRows([])
        setProgress({ done: 0, total: 0, failed: 0 })
        setDragOver(false)
    }

    function clearFile() {
        setFileName(null)
        setFileSize(0)
        setRows([])
    }

    /** Shared file → rows pipeline used by both the file input and drag/drop.
     *
     *  Accepts CSV, TXT, XLSX and XLS. Excel files are converted to a CSV
     *  string via SheetJS before hitting the existing `parseImportCsv` —
     *  one parser, two file formats, no duplicate validation logic. */
    async function processFile(file: File) {
        const isCsv = /\.(csv|txt)$/i.test(file.name)
        const isExcel = /\.(xlsx|xls)$/i.test(file.name)
        if (!isCsv && !isExcel) {
            toast.error('Invalid file', 'Upload a CSV (.csv) or Excel (.xlsx, .xls) file.')
            return
        }

        let text: string
        try {
            if (isCsv) {
                text = await file.text()
            } else {
                // Dynamic import — the xlsx bundle is heavy (~500 KB) and
                // only this code path needs it. Vite splits it into its own
                // chunk so the attendance page doesn't carry the weight on
                // first paint.
                const XLSX = await import('xlsx')
                const buffer = await file.arrayBuffer()
                const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
                const sheet = wb.Sheets[wb.SheetNames[0]]
                if (!sheet) {
                    toast.error('Empty workbook', 'No sheets found in the Excel file.')
                    return
                }
                // sheet_to_csv emits a normal CSV string — including blank
                // cells as empty fields — that the existing parser handles
                // unchanged. Force UTF-8 BOM off so the date header isn't
                // mistaken for "\uFEFFdate".
                text = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
            }
        } catch (err) {
            toast.error('Could not read file', err instanceof Error ? err.message : 'Unknown error')
            return
        }

        const parsed = parseImportCsv(text)
        setFileName(file.name)
        setFileSize(file.size)
        setRows(parsed)
        if (parsed.length === 0) {
            toast.error('Empty file', 'No data rows found in the file.')
        }
    }

    /**
     * Sample template rows. Covers both identity columns:
     *   - employee_no  (HRHub's own employee code)
     *   - mapper_id    (biometric device user id; takes precedence when both are set)
     *
     * One file format for the sample (.xlsx) keeps the UI uncluttered. The
     * parser still accepts CSV uploads — only the sample-download surface
     * is xlsx-only.
     */
    const SAMPLE_HEADER = ['employee_no', 'mapper_id', 'date', 'in_time', 'out_time', 'in_notes', 'out_notes', 'location']
    const SAMPLE_ROWS: ReadonlyArray<ReadonlyArray<string>> = [
        ['EMP-001', '', '2026-05-19', '09:00', '18:00', 'On-time', 'End of shift', 'Office'],
        ['EMP-001', '', '2026-05-19', '19:00', '21:30', 'Overtime in', 'Overtime out', 'Office'],
        ['', '101', '2026-05-20', '08:55', '17:30', 'Biometric punch', 'Auto out', 'Site A'],
        ['EMP-002', '', '2026-05-20', '09:10', '', 'Forgot punch-out', '', 'Site B'],
    ]

    async function downloadSample() {
        // Lazy-load xlsx — same reason as the import path: it's a heavy
        // chunk we shouldn't ship until HR actually asks for it.
        const XLSX = await import('xlsx')
        const sheet = XLSX.utils.aoa_to_sheet([[...SAMPLE_HEADER], ...SAMPLE_ROWS.map((r) => [...r])])
        // Column widths sized to the longest header so the file opens
        // looking presentable instead of every column being 8.43 wide.
        sheet['!cols'] = [
            { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
            { wch: 22 }, { wch: 22 }, { wch: 14 },
        ]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, sheet, 'Attendance')
        const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const filename = 'attendance-import-sample.xlsx'
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
    }

    async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        await processFile(file)
    }

    async function submit() {
        // Each row carries its own employeeId (populated by resolveImportRow
        // during validation). We loop them and call addManual per-row —
        // failures on individual rows don't abort the rest. Network-level
        // errors increment `failed`; the row stays visible in the preview
        // so HR can see exactly which line broke.
        //
        // The backend now returns a `duplicate` flag per call indicating
        // that the (employee, timestamp, punchType) already existed on
        // disk. We count those separately so the final toast tells HR
        // "5 imported, 2 skipped as duplicates" — re-uploads stay safe.
        const valid = resolvedRows.filter((r) => r.errors.length === 0 && r.employeeId)
        if (valid.length === 0) return
        setSubmitting(true)
        setProgress({ done: 0, total: valid.length, failed: 0 })
        let done = 0
        let failed = 0
        let created = 0
        let duplicate = 0
        for (const r of valid) {
            try {
                const res = await addManual.mutateAsync({
                    employeeId: r.employeeId as string,
                    date: r.date,
                    inTime: r.inTime,
                    outTime: r.outTime ?? undefined,
                    inNotes: r.inNotes ?? undefined,
                    outNotes: r.outNotes ?? undefined,
                    locationName: r.locationName ?? undefined,
                }) as { data?: { duplicate?: boolean } } | undefined
                if (res?.data?.duplicate) duplicate += 1
                else created += 1
            } catch {
                failed += 1
            }
            done += 1
            setProgress({ done, total: valid.length, failed })
        }
        setSubmitting(false)
        // Build a single summary string covering every action bucket so
        // the user sees exactly what landed in the DB.
        if (failed > 0) {
            toast.error('Some rows failed', `${created} imported · ${duplicate} duplicate · ${failed} failed.`)
        } else if (duplicate > 0 && created === 0) {
            toast.success('Nothing new to import',
                `All ${duplicate} row${duplicate === 1 ? '' : 's'} already existed in the system.`)
            reset()
            onOpenChange(false)
        } else {
            const parts: string[] = [`${created} ${created === 1 ? 'entry' : 'entries'} imported`]
            if (duplicate > 0) parts.push(`${duplicate} skipped as duplicate${duplicate === 1 ? '' : 's'}`)
            toast.success('Import complete', parts.join(' · '))
            reset()
            onOpenChange(false)
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) reset()
                onOpenChange(o)
            }}
        >
            <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                {/* Branded header — gradient + icon avatar, same design
                    language as the travel + biometric dialogs so the whole
                    HR app reads as one product. */}
                <DialogHeader className="space-y-0 p-6 pb-4 border-b bg-gradient-to-br from-sky-50/60 to-cyan-50/40 dark:from-sky-950/20 dark:to-cyan-950/15">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm shadow-cyan-500/20">
                            <Upload className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-base font-semibold">Import attendance entries</DialogTitle>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Each row carries its own employee — supply <code className="font-mono">employee_no</code> or biometric <code className="font-mono">mapper_id</code>.
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {/* required columns first (highlighted ring), optional after */}
                                {[
                                    { col: 'employee_no', required: true },
                                    { col: 'mapper_id', required: true },
                                    { col: 'date', required: true },
                                    { col: 'in_time', required: true },
                                    { col: 'out_time', required: false },
                                    { col: 'in_notes', required: false },
                                    { col: 'out_notes', required: false },
                                    { col: 'location', required: false },
                                ].map((c) => (
                                    <code
                                        key={c.col}
                                        className={cn(
                                            'rounded border px-1.5 py-0.5 text-[10px] font-mono font-medium',
                                            c.required
                                                ? 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300'
                                                : 'bg-background text-foreground/60',
                                        )}
                                    >
                                        {c.col}
                                    </code>
                                ))}
                            </div>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                                Either <code className="font-mono">employee_no</code> or <code className="font-mono">mapper_id</code> is required per row.
                            </p>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-muted/20">
                    {/* Single-step flow now — the CSV carries identity per
                        row, no employee picker required. */}
                    <section className="rounded-lg border bg-card p-4">
                        <header className="mb-3 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                                <StepChip n={1} active={!fileName} done={!!fileName} />
                                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                    Upload CSV or Excel
                                </h3>
                            </div>
                            {/* Single .xlsx sample — Excel is the format
                                biometric devices and HR teams both export
                                natively. Keeping two buttons would clutter
                                the header for no real benefit (the parser
                                accepts both formats either way). */}
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { void downloadSample() }}
                                className="gap-1.5 h-7 text-[11px]"
                            >
                                <Download className="size-3" />
                                Download sample
                            </Button>
                        </header>

                        {!fileName ? (
                            <label
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={async (e) => {
                                    e.preventDefault()
                                    setDragOver(false)
                                    const f = e.dataTransfer.files?.[0]
                                    if (f) await processFile(f)
                                }}
                                className={cn(
                                    'flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 cursor-pointer transition-colors',
                                    dragOver
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border bg-muted/20 hover:bg-muted/30',
                                )}
                            >
                                <FileSpreadsheet className="size-8 text-muted-foreground/60" />
                                <div className="text-center">
                                    <p className="text-sm font-medium">
                                        {dragOver ? 'Drop to upload' : 'Drag a CSV or Excel file here, or click to browse'}
                                    </p>
                                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                                        Max 1,000 rows · .csv, .xlsx or .xls accepted
                                    </p>
                                </div>
                                <input
                                    type="file"
                                    accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                    onChange={onFile}
                                    className="hidden"
                                />
                            </label>
                        ) : (
                            <div className="flex items-center gap-3 rounded-md border bg-background p-3">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                    <FileSpreadsheet className="size-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">{fileName}</p>
                                    <p className="text-[11px] text-muted-foreground tabular-nums">
                                        {formatFileSize(fileSize)}
                                        {rows.length > 0 && ` · ${rows.length} row${rows.length === 1 ? '' : 's'} parsed`}
                                    </p>
                                </div>
                                <Button size="sm" variant="ghost" onClick={clearFile} className="gap-1 text-muted-foreground hover:text-foreground">
                                    <X className="size-3.5" />
                                    Replace
                                </Button>
                            </div>
                        )}
                    </section>

                    {/* Preview — KPI strip + table. Row colouring already
                        reflects errors so HR can scan for problems at a
                        glance before clicking Import. */}
                    {resolvedRows.length > 0 && (
                        <section className="rounded-lg border bg-card overflow-hidden">
                            <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
                                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                    Preview · {resolvedRows.length} row{resolvedRows.length === 1 ? '' : 's'}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                        <CheckCircle2 className="size-3" />
                                        {validCount} valid
                                    </span>
                                    {errorCount > 0 && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                                            <AlertCircle className="size-3" />
                                            {errorCount} error{errorCount === 1 ? '' : 's'}
                                        </span>
                                    )}
                                </div>
                            </header>
                            <div className="max-h-80 overflow-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/20 sticky top-0">
                                        <tr className="text-left text-muted-foreground">
                                            <th className="px-2 py-1.5 font-medium">#</th>
                                            <th className="px-2 py-1.5 font-medium">Employee</th>
                                            <th className="px-2 py-1.5 font-medium">Date</th>
                                            <th className="px-2 py-1.5 font-medium">In</th>
                                            <th className="px-2 py-1.5 font-medium">Out</th>
                                            <th className="px-2 py-1.5 font-medium">Location</th>
                                            <th className="px-2 py-1.5 font-medium">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {resolvedRows.map((r) => (
                                            <tr
                                                key={r.rowNum}
                                                className={
                                                    r.errors.length > 0
                                                        ? 'border-t bg-rose-50/40 dark:bg-rose-950/10'
                                                        : 'border-t'
                                                }
                                            >
                                                <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.rowNum}</td>
                                                <td className="px-2 py-1.5">
                                                    {r.resolvedName ? (
                                                        // Resolved row — avatar + name + identity tag.
                                                        // Avatar makes the preview scannable: HR sees
                                                        // a face/initial pair, not just a wall of names.
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <InitialsAvatar
                                                                name={r.resolvedName}
                                                                src={r.resolvedAvatarUrl}
                                                                size="sm"
                                                            />
                                                            <div className="min-w-0">
                                                                <p className="truncate font-medium leading-tight">{r.resolvedName}</p>
                                                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">
                                                                    {r.employeeKey} · via {r.resolvedVia === 'mapper_id' ? 'biometric' : 'employee no'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        // Unresolved — placeholder circle + raw key so
                                                        // the column doesn't visually jump between
                                                        // resolved and unresolved rows.
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span
                                                                aria-hidden
                                                                className="size-7 shrink-0 rounded-full border border-dashed border-rose-300 bg-rose-50/40 flex items-center justify-center text-rose-400 dark:border-rose-900/60 dark:bg-rose-950/20"
                                                            >
                                                                <AlertCircle className="size-3.5" />
                                                            </span>
                                                            <span className="font-mono text-xs text-muted-foreground truncate">
                                                                {r.employeeKey ?? '—'}
                                                            </span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 tabular-nums">{r.date || '—'}</td>
                                                <td className="px-2 py-1.5 tabular-nums text-emerald-700 dark:text-emerald-400">{r.inTime || '—'}</td>
                                                <td className="px-2 py-1.5 tabular-nums text-rose-700 dark:text-rose-400">{r.outTime ?? '—'}</td>
                                                <td className="px-2 py-1.5 truncate max-w-[160px]">{r.locationName ?? '—'}</td>
                                                <td className="px-2 py-1.5">
                                                    {r.errors.length === 0 ? (
                                                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                                            <CheckCircle2 className="size-3" /> OK
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400" title={r.errors.join('; ')}>
                                                            <AlertCircle className="size-3" /> {r.errors[0]}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {/* Progress */}
                    {submitting && progress.total > 0 && (
                        <div className="rounded-xl border bg-card p-3 text-xs">
                            <div className="flex justify-between mb-1.5">
                                <span>Importing…</span>
                                <span className="tabular-nums">
                                    {progress.done} / {progress.total}
                                    {progress.failed > 0 && (
                                        <span className="text-rose-600 ms-2">({progress.failed} failed)</span>
                                    )}
                                </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all"
                                    style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t bg-background px-6 py-3 sm:flex-row sm:justify-between">
                    {/* Contextual hint icon switches with the state so the
                        user always sees a precise next-action prompt. */}
                    <div className="flex items-center gap-2 self-center text-[11px] text-muted-foreground">
                        {resolvedRows.length === 0 ? (
                            <>
                                <Upload className="size-3.5 text-sky-500" />
                                <span>Choose a CSV or Excel file to preview</span>
                            </>
                        ) : errorCount > 0 ? (
                            <>
                                <AlertCircle className="size-3.5 text-rose-500" />
                                <span>{errorCount} row{errorCount === 1 ? '' : 's'} will be skipped — fix and re-upload to import them</span>
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="size-3.5 text-emerald-500" />
                                <span>Ready to import {validCount} row{validCount === 1 ? '' : 's'}</span>
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button size="sm" onClick={submit} disabled={!canImport} className="gap-1.5">
                            <Upload className="size-3.5" />
                            {submitting ? 'Importing…' : `Import${validCount > 0 ? ` ${validCount} row${validCount === 1 ? '' : 's'}` : ''}`}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Small numbered step indicator used in the import dialog. Three visual
 * states drive HR's eye through the two-step flow:
 *   - active  (current step)      → primary background, white digit
 *   - done    (completed earlier) → emerald background, check icon
 *   - default (future / inert)    → muted background
 */
function StepChip({ n, active, done }: { n: number; active?: boolean; done?: boolean }) {
    return (
        <div
            className={cn(
                'flex size-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                done
                    ? 'bg-emerald-500 text-white'
                    : active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
            )}
        >
            {done ? <Check className="size-3" /> : n}
        </div>
    )
}

/** Human-readable file size used in the "file selected" card. */
function formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function parseImportCsv(text: string): ImportRow[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
    if (lines.length === 0) return []
    const header = splitImportCsvLine(lines[0]!).map((h) => h.trim().toLowerCase())
    const idx = (name: string) => header.indexOf(name)
    // Identity columns — accept either or both. Mapper id wins (used by
    // biometric devices; one external ID per device user).
    const empNoIdx = idx('employee_no') !== -1 ? idx('employee_no') : idx('employee_code')
    const mapperIdx = idx('mapper_id') !== -1 ? idx('mapper_id') : idx('biometric_id')
    const dateIdx = idx('date')
    const inIdx = idx('in_time') !== -1 ? idx('in_time') : idx('in')
    const outIdx = idx('out_time') !== -1 ? idx('out_time') : idx('out')
    const inNotesIdx = idx('in_notes')
    const outNotesIdx = idx('out_notes')
    const locIdx = idx('location') !== -1 ? idx('location') : idx('location_name')

    const dataLines = dateIdx === -1 ? lines : lines.slice(1)
    const out: ImportRow[] = []
    for (let i = 0; i < dataLines.length; i += 1) {
        if (i >= 1000) break
        const cells = splitImportCsvLine(dataLines[i]!)
        const get = (j: number) => (j >= 0 && j < cells.length ? cells[j]!.trim() : '')
        const mapperRaw = get(mapperIdx)
        const empNoRaw = get(empNoIdx)
        // employeeKey carries the raw lookup token — preference order:
        //   mapper_id (if present) → employee_no
        // The resolver tries both; this just records which one to display
        // in error messages.
        const employeeKey = mapperRaw || empNoRaw || null
        const date = dateIdx === -1 ? get(0) : get(dateIdx)
        const inTime = normalizeImportTime(get(inIdx))
        const outRaw = get(outIdx)
        const outTime = outRaw ? normalizeImportTime(outRaw) : null
        const inNotes = get(inNotesIdx) || null
        const outNotes = get(outNotesIdx) || null
        const locationName = get(locIdx) || null

        const errors: string[] = []
        if (!employeeKey) errors.push('Missing employee_no or mapper_id')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('Invalid date (YYYY-MM-DD)')
        if (!inTime || !/^\d{2}:\d{2}$/.test(inTime)) errors.push('Invalid in_time (HH:MM)')
        if (outTime && !/^\d{2}:\d{2}$/.test(outTime)) errors.push('Invalid out_time (HH:MM)')

        out.push({
            rowNum: i + 2,
            date,
            inTime: inTime || '',
            outTime,
            inNotes,
            outNotes,
            locationName,
            employeeKey,
            employeeId: null,
            errors,
        })
    }
    return out
}

/**
 * Post-parse resolver — populates `employeeId` and (on failure) appends an
 * error to the row. Pure function so React's `useMemo` can re-run it
 * whenever the lookup map changes (e.g., mappings finish loading after the
 * dialog opened).
 *
 * The resolver also annotates `resolvedName` and `resolvedVia` so the
 * preview table can render the canonical employee + tag "(via biometric)"
 * without re-doing the lookup at render time.
 */
function resolveImportRow(
    row: ImportRow,
    lookup: Map<string, { id: string; name: string; avatarUrl: string | null; via: 'employee_no' | 'mapper_id' }>,
): ResolvedImportRow {
    if (!row.employeeKey) {
        return {
            ...row,
            employeeId: null,
            resolvedName: null,
            resolvedAvatarUrl: null,
            resolvedVia: null,
        }
    }
    const hit = lookup.get(row.employeeKey.trim().toLowerCase())
    if (!hit) {
        // Only add the error if the row hasn't already failed on something
        // upstream — keeps the per-row error list short & actionable.
        const errors = row.errors.includes('Missing employee_no or mapper_id')
            ? row.errors
            : [...row.errors, `No employee found for "${row.employeeKey}"`]
        return {
            ...row,
            errors,
            employeeId: null,
            resolvedName: null,
            resolvedAvatarUrl: null,
            resolvedVia: null,
        }
    }
    return {
        ...row,
        employeeId: hit.id,
        resolvedName: hit.name,
        resolvedAvatarUrl: hit.avatarUrl,
        resolvedVia: hit.via,
    }
}

function splitImportCsvLine(line: string): string[] {
    const out: string[] = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i]!
        if (quoted) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1 }
            else if (ch === '"') quoted = false
            else cur += ch
        } else {
            if (ch === ',') { out.push(cur); cur = '' }
            else if (ch === '"') quoted = true
            else cur += ch
        }
    }
    out.push(cur)
    return out
}

function normalizeImportTime(raw: string): string {
    const s = raw.trim()
    if (!s) return ''
    if (/^\d{2}:\d{2}$/.test(s)) return s
    if (/^\d{1}:\d{2}$/.test(s)) return `0${s}`
    if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2)}`
    return s
}
