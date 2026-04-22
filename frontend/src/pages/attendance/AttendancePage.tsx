import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts'
import { useAttendance, type AttendanceRecord } from '@/hooks/useAttendance'
import { useEmployees } from '@/hooks/useEmployees'
import { Clock, CalendarDays } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
    present: '#22c55e',
    absent: '#ef4444',
    half_day: '#eab308',
    late: '#f97316',
    wfh: '#3b82f6',
    on_leave: '#a855f7',
}

const statusLabel: Record<string, string> = {
    present: 'Present', absent: 'Absent', half_day: 'Half Day',
    late: 'Late', wfh: 'WFH', on_leave: 'On Leave',
}

const statusBadge: Record<string, string> = {
    present: 'bg-green-100 text-green-800',
    absent: 'bg-red-100 text-red-800',
    half_day: 'bg-yellow-100 text-yellow-800',
    late: 'bg-orange-100 text-orange-800',
    wfh: 'bg-blue-100 text-blue-800',
    on_leave: 'bg-purple-100 text-purple-800',
}

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

export function AttendancePage() {
    const { t } = useTranslation()
    const [monthOffset, setMonthOffset] = useState(0)
    const [filterEmployee, setFilterEmployee] = useState('')

    const { start, end, label } = getMonthRange(monthOffset)

    const { data: records, isLoading } = useAttendance({
        startDate: start,
        endDate: end,
        employeeId: filterEmployee || undefined,
    })
    const { data: employees } = useEmployees({ limit: 200 })

    const list: AttendanceRecord[] = Array.isArray(records) ? records : []
    const empList: any[] = Array.isArray(employees) ? employees : (employees as any)?.data ?? []

    const summary = useMemo(() => {
        const counts: Record<string, number> = { present: 0, absent: 0, late: 0, wfh: 0, half_day: 0, on_leave: 0 }
        let totalHours = 0, totalOT = 0
        for (const r of list) {
            counts[r.status] = (counts[r.status] ?? 0) + 1
            totalHours += parseFloat(r.hoursWorked ?? '0')
            totalOT += parseFloat(r.overtimeHours ?? '0')
        }
        return { counts, totalHours, totalOT }
    }, [list])

    const pieData = useMemo(() =>
        Object.entries(STATUS_COLORS)
            .map(([key, color]) => ({ name: statusLabel[key], value: summary.counts[key] ?? 0, color }))
            .filter(d => d.value > 0),
        [summary]
    )

    const dailyData = useMemo(() => {
        const map: Record<string, { date: string; present: number; absent: number; late: number; hours: number }> = {}
        for (const r of list) {
            if (!map[r.date]) map[r.date] = { date: r.date, present: 0, absent: 0, late: 0, hours: 0 }
            if (r.status === 'present') map[r.date].present++
            else if (r.status === 'absent') map[r.date].absent++
            else if (r.status === 'late') map[r.date].late++
            map[r.date].hours += parseFloat(r.hoursWorked ?? '0')
        }
        return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({ ...d, date: d.date.slice(5) }))
    }, [list])

    const empSummary = useMemo(() => {
        const map: Record<string, { empId: string; name: string; present: number; absent: number; hours: number; ot: number }> = {}
        for (const r of list) {
            if (!map[r.employeeId]) {
                const emp = empList.find(e => e.id === r.employeeId)
                map[r.employeeId] = { empId: r.employeeId, name: emp ? `${emp.firstName} ${emp.lastName}` : '...', present: 0, absent: 0, hours: 0, ot: 0 }
            }
            if (r.status === 'present') map[r.employeeId].present++
            else if (r.status === 'absent') map[r.employeeId].absent++
            map[r.employeeId].hours += parseFloat(r.hoursWorked ?? '0')
            map[r.employeeId].ot += parseFloat(r.overtimeHours ?? '0')
        }
        return Object.values(map).sort((a, b) => b.hours - a.hours)
    }, [list, empList])

    return (
        <PageWrapper>
            <PageHeader
                title="Attendance"
                description="Track daily employee attendance, punch history, and working hours"
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setMonthOffset(o => o - 1)}>&lsaquo;</Button>
                        <span className="text-sm font-medium min-w-[140px] text-center">{label}</span>
                        <Button variant="outline" size="sm" onClick={() => setMonthOffset(o => Math.min(0, o + 1))} disabled={monthOffset === 0}>&rsaquo;</Button>
                        <Button variant="ghost" size="sm" onClick={() => setMonthOffset(0)} disabled={monthOffset === 0}>{t('attendance.currentMonth')}</Button>
                    </div>
                }
            />

            {/* KPI summary strip */}
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
                {(['present', 'absent', 'late', 'wfh', 'half_day', 'on_leave'] as const).map(s => (
                    <Card key={s} className="p-3 text-center">
                        <p className="text-xl font-bold" style={{ color: STATUS_COLORS[s] }}>{summary.counts[s] ?? 0}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{statusLabel[s]}</p>
                    </Card>
                ))}
                <Card className="p-3 text-center">
                    <p className="text-xl font-bold text-primary">{summary.totalHours.toFixed(0)}h</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t('attendance.totalHours')}</p>
                </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">{t('attendance.statusDistribution')}</CardTitle></CardHeader>
                    <CardContent>
                        {pieData.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-8">No data</p>
                        ) : (
                            <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={70}>
                                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
                <Card className="lg:col-span-2">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">{t('attendance.dailyTrend')}</CardTitle></CardHeader>
                    <CardContent>
                        {dailyData.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-8">No data</p>
                        ) : (
                            <ResponsiveContainer width="100%" height={200}>
                                <LineChart data={dailyData} margin={{ left: -20, right: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="present" stroke={STATUS_COLORS.present} strokeWidth={2} dot={false} name="Present" />
                                    <Line type="monotone" dataKey="absent" stroke={STATUS_COLORS.absent} strokeWidth={2} dot={false} name="Absent" />
                                    <Line type="monotone" dataKey="late" stroke={STATUS_COLORS.late} strokeWidth={2} dot={false} name="Late" />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Hours by employee bar chart */}
            {empSummary.length > 0 && (
                <Card className="mb-6">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">{t('attendance.hoursByEmployee')}</CardTitle></CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={empSummary.slice(0, 15)} margin={{ left: -20, right: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip formatter={(v) => `${Number(v).toFixed(1)}h`} />
                                <Bar dataKey="hours" fill="#3b82f6" name="Regular" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="ot" fill="#a855f7" name="Overtime" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}

            {/* Employee filter */}
            <Card className="p-4 mb-4">
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="space-y-1.5">
                        <Label className="text-xs">{t('attendance.filterByEmployee')}</Label>
                        <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                            <SelectTrigger className="w-52"><SelectValue placeholder={t('attendance.allEmployees')} /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="">{t('attendance.allEmployees')}</SelectItem>
                                {empList.map((e: any) => (
                                    <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {filterEmployee && (
                        <Button variant="ghost" size="sm" onClick={() => setFilterEmployee('')}>Clear</Button>
                    )}
                </div>
            </Card>

            {/* Punch history table */}
            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : list.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16">
                    <CalendarDays className="h-10 w-10 text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">{t('attendance.noRecords')} — {label}.</p>
                </div>
            ) : (
                <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium">{t('common.date')}</th>
                                <th className="text-left px-4 py-3 font-medium">{t('employees.fullName')}</th>
                                <th className="text-left px-4 py-3 font-medium">{t('common.status')}</th>
                                <th className="text-left px-4 py-3 font-medium">{t('attendance.punchIn')}</th>
                                <th className="text-left px-4 py-3 font-medium">{t('attendance.punchOut')}</th>
                                <th className="text-right px-4 py-3 font-medium">{t('attendance.hoursWorked')}</th>
                                <th className="text-right px-4 py-3 font-medium">{t('attendance.overtime')}</th>
                                <th className="text-left px-4 py-3 font-medium">{t('common.notes')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {list.map((rec: AttendanceRecord) => {
                                const emp = empList.find((e: any) => e.id === rec.employeeId)
                                return (
                                    <tr key={rec.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-3 font-mono text-xs">{rec.date}</td>
                                        <td className="px-4 py-3 font-medium">{emp ? `${emp.firstName} ${emp.lastName}` : '—'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[rec.status]}`}>
                                                {statusLabel[rec.status]}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-green-700">{fmtTime(rec.checkIn)}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-red-700">{fmtTime(rec.checkOut)}</td>
                                        <td className="px-4 py-3 text-right">{rec.hoursWorked ? `${parseFloat(rec.hoursWorked).toFixed(1)}h` : '—'}</td>
                                        <td className="px-4 py-3 text-right">{rec.overtimeHours && parseFloat(rec.overtimeHours) > 0 ? <span className="text-purple-700 font-medium">{parseFloat(rec.overtimeHours).toFixed(1)}h</span> : '—'}</td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">{rec.notes ?? '—'}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </PageWrapper>
    )
}

