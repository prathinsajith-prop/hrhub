import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { type ColumnDef } from '@tanstack/react-table'
import {
    ChevronLeft, ChevronRight, CalendarDays, Clock, UserCheck, UserX,
    AlarmClock, Home, CalendarOff, TrendingUp, Download, Edit2, RefreshCcw,
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
import { toast } from '@/components/ui/overlays'
import {
    StatusBadge, EmptyState, TableSkeleton, InitialsAvatar,
    type StatusTone,
} from '@/components/shared'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { useAttendance, useUpsertAttendance, type AttendanceRecord } from '@/hooks/useAttendance'
import { useEmployees } from '@/hooks/useEmployees'

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

function getMonthRange(offset = 0) {
    const d = new Date()
    d.setMonth(d.getMonth() + offset)
    const year = d.getFullYear()
    const month = d.getMonth()
    const start = new Date(year, month, 1).toISOString().split('T')[0]
    const end = new Date(year, month + 1, 0).toISOString().split('T')[0]
    return { start, end, label: d.toLocaleString('en-AE', { month: 'long', year: 'numeric' }) }
}

// ─────────────────────────── Page ────────────────────────────────────────

export function AttendancePage() {
    const { t } = useTranslation()
    const [monthOffset, setMonthOffset] = useState(0)
    const [filterEmployee, setFilterEmployee] = useState('')
    const [filterStatus, setFilterStatus] = useState<'all' | AttendanceRecord['status']>('all')

    const { start, end, label } = useMemo(() => getMonthRange(monthOffset), [monthOffset])

    const { data: records, isLoading, refetch, isFetching } = useAttendance({
        startDate: start,
        endDate: end,
        employeeId: filterEmployee || undefined,
    })
    const { data: employeesData } = useEmployees({ limit: 200 })
    const upsert = useUpsertAttendance()

    const list = useMemo<AttendanceRecord[]>(
        () => (Array.isArray(records) ? records : []),
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
        const m = new Map<string, { name: string; initials: string; department?: string }>()
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
            })
        }
        return m
    }, [empList])

    // Filter by status (client-side, since status filter not sent to API here)
    const filteredList = useMemo(
        () => (filterStatus === 'all' ? list : list.filter((r) => r.status === filterStatus)),
        [list, filterStatus],
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
            .sort((a, b) => a.date.localeCompare(b.date))
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
        return [...map.values()].sort((a, b) => b.hours - a.hours)
    }, [list, empMap])

    const handleEdit = useCallback(
        (rec: AttendanceRecord) => {
            // Placeholder for edit modal — connected to useUpsertAttendance
            toast.info(
                'Edit attendance',
                `Edit flow for ${empMap.get(rec.employeeId)?.name ?? 'employee'} on ${rec.date} will open here.`,
            )
        },
        [empMap],
    )

    const handleExport = useCallback(() => {
        if (!filteredList.length) {
            toast.warning('Nothing to export', 'No records in the current view.')
            return
        }
        const header = ['Date', 'Employee', 'Status', 'Punch In', 'Punch Out', 'Hours', 'Overtime', 'Notes']
        const rows = filteredList.map((r) => [
            r.date,
            empMap.get(r.employeeId)?.name ?? '—',
            STATUS_LABEL[r.status],
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
        toast.success('Exported', `${filteredList.length} rows exported to CSV.`)
    }, [filteredList, empMap, start, end])

    // Explicitly reference mutation to keep for future edit modal wiring
    void upsert

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
            accessorFn: (row) => empMap.get(row.employeeId)?.name ?? '—',
            cell: ({ row: { original: r } }) => {
                const emp = empMap.get(r.employeeId)
                return (
                    <div className="flex items-center gap-2.5 min-w-0">
                        <InitialsAvatar
                            name={emp?.name ?? '—'}
                            size="sm"
                        />
                        <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{emp?.name ?? '—'}</p>
                            {emp?.department && (
                                <p className="text-[11px] text-muted-foreground truncate">{emp.department}</p>
                            )}
                        </div>
                    </div>
                )
            },
            size: 220,
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
                        <Edit2 className="h-3 w-3" />
                        Edit
                    </Button>
                </div>
            ),
            size: 80,
        },
    ], [empMap, handleEdit])

    return (
        <PageWrapper>
            <PageHeader
                eyebrow="Operations"
                title={t('attendance.title')}
                description={t('attendance.description')}
                actions={
                    <div className="flex items-center gap-2">
                        <div className="inline-flex items-center rounded-lg border bg-card h-9 overflow-hidden">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 px-2 rounded-none"
                                onClick={() => setMonthOffset((o) => o - 1)}
                                aria-label="Previous month"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className="px-3 text-xs font-medium min-w-[140px] text-center border-l border-r">
                                {label}
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 px-2 rounded-none"
                                onClick={() => setMonthOffset((o) => Math.min(0, o + 1))}
                                disabled={monthOffset === 0}
                                aria-label="Next month"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<RefreshCcw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />}
                            onClick={() => refetch()}
                            disabled={isFetching}
                        >
                            Refresh
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Download className="h-3.5 w-3.5" />}
                            onClick={handleExport}
                        >
                            Export
                        </Button>
                    </div>
                }
            />

            {/* KPI strip — 8 tiles */}
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

            {/* Records */}
            <Card>
                <CardHeader className="flex-row items-start sm:items-center justify-between gap-3 flex-wrap pb-4">
                    <div>
                        <CardTitle className="text-base">Punch history</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {summary.totalRecords} records in {label}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                        <Select
                            value={filterEmployee || '__all__'}
                            onValueChange={(v) => setFilterEmployee(v === '__all__' ? '' : v)}
                        >
                            <SelectTrigger className="h-8 text-xs w-48">
                                <SelectValue placeholder="All employees" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">All employees</SelectItem>
                                {empList.map((e) => {
                                    const name = (e.fullName as string | undefined)
                                        ?? `${(e.firstName as string | undefined) ?? ''} ${(e.lastName as string | undefined) ?? ''}`.trim()
                                    return (
                                        <SelectItem key={e.id} value={e.id}>{name || '—'}</SelectItem>
                                    )
                                })}
                            </SelectContent>
                        </Select>
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
                    ) : filteredList.length === 0 ? (
                        <EmptyState
                            icon={CalendarDays}
                            title={t('attendance.noRecords')}
                            description={`No matching records in ${label}.`}
                        />
                    ) : (
                        <DataTable
                            columns={columns}
                            data={filteredList}
                            searchKey="employee"
                            searchPlaceholder="Search by employee, status…"
                            pageSize={10}
                            emptyMessage={t('attendance.noRecords')}
                        />
                    )}
                </CardContent>
            </Card>
        </PageWrapper>
    )
}
