import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type ColumnDef } from '@tanstack/react-table'
import { LogOut, DollarSign, CheckCircle2, Clock, UserMinus } from 'lucide-react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { NumericInput } from '@/components/ui/numeric-input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DataTable } from '@/components/ui/data-table'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { InitialsAvatar } from '@/components/shared/Avatar'
import { useExitRequests, useInitiateExit, useApproveExit, useMarkSettlementPaid, useSettlementPreview, type ExitRequest } from '@/hooks/useExit'
import { useEmployees } from '@/hooks/useEmployees'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { applyClientFilters, type FilterConfig } from '@/lib/filters'
import { usePermissions } from '@/hooks/usePermissions'
import { formatDate, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/overlays'

const EXIT_FILTERS: FilterConfig[] = [
    {
        name: 'exitType', label: 'Exit type', type: 'select', field: 'exitType',
        options: [
            { value: 'resignation', label: 'Resignation' },
            { value: 'termination', label: 'Termination' },
            { value: 'contract_end', label: 'Contract End' },
            { value: 'retirement', label: 'Retirement' },
        ],
    },
    {
        name: 'status', label: 'Status', type: 'select', field: 'status',
        options: [
            { value: 'pending', label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'completed', label: 'Completed' },
        ],
    },
    { name: 'exitDate', label: 'Exit date', type: 'date_range', field: 'exitDate' },
]

const statusVariant: Record<string, 'warning' | 'info' | 'destructive' | 'success' | 'secondary'> = {
    pending: 'warning',
    approved: 'info',
    rejected: 'destructive',
    completed: 'success',
}

const exitTypeLabel: Record<string, string> = {
    resignation: 'Resignation',
    termination: 'Termination',
    contract_end: 'Contract End',
    retirement: 'Retirement',
}

const exitTypeColor: Record<string, string> = {
    resignation: 'bg-amber-100 text-amber-700',
    termination: 'bg-red-100 text-red-700',
    contract_end: 'bg-blue-100 text-blue-700',
    retirement: 'bg-emerald-100 text-emerald-700',
}

interface InitiateForm {
    employeeId: string
    exitType: 'resignation' | 'termination' | 'contract_end' | 'retirement'
    exitDate: string
    lastWorkingDay: string
    noticePeriodDays: number
    reason: string
    notes: string
}

const defaultForm: InitiateForm = {
    employeeId: '',
    exitType: 'resignation',
    exitDate: '',
    lastWorkingDay: '',
    noticePeriodDays: 30,
    reason: '',
    notes: '',
}

function fmt(n: string | number | undefined) {
    if (n === undefined || n === null) return '—'
    return formatCurrency(Number(n))
}

export function ExitPage() {
    const { t } = useTranslation()
    const { can } = usePermissions()
    const canManage = can('manage_exit')

    const { data: exits, isLoading } = useExitRequests()
    const { data: employees } = useEmployees({ limit: 1000 })
    const initiate = useInitiateExit()
    const approve = useApproveExit()
    const markPaid = useMarkSettlementPaid()

    const [showDialog, setShowDialog] = useState(false)
    const [form, setForm] = useState<InitiateForm>(defaultForm)
    const [step, setStep] = useState<'form' | 'preview'>('form')

    const exitSearch = useSearchFilters({
        storageKey: 'hrhub.exit.searchHistory',
        availableFilters: EXIT_FILTERS,
    })

    const previewEnabled = !!form.employeeId && !!form.exitDate && !!form.exitType
    const { data: preview, isLoading: previewLoading } = useSettlementPreview(
        previewEnabled ? form.employeeId : undefined,
        previewEnabled ? form.exitDate : undefined,
        previewEnabled ? form.exitType : undefined,
    )

    const set = (k: keyof InitiateForm, v: string | number) => setForm(f => ({ ...f, [k]: v }))

    async function handleSubmit() {
        await initiate.mutateAsync(form)
        toast.success('Exit initiated', 'Employee exit request submitted successfully.')
        setShowDialog(false)
        setForm(defaultForm)
        setStep('form')
    }

    const empList = Array.isArray(employees) ? employees : (employees as any)?.data ?? []
    const exitList: ExitRequest[] = Array.isArray(exits) ? exits : (exits as any)?.data ?? []

    const enrichedExits = useMemo(
        () => exitList.map((e) => {
            const emp = empList.find((em: any) => em.id === e.employeeId)
            return {
                ...e,
                employeeName: emp ? `${emp.firstName} ${emp.lastName}` : '—',
                employeeDepartment: emp?.department ?? '',
                employeeDesignation: emp?.designation ?? '',
            }
        }),
        [exitList, empList],
    )

    const filteredExits = useMemo(
        () => applyClientFilters(enrichedExits as any[], {
            searchInput: exitSearch.searchInput,
            appliedFilters: exitSearch.appliedFilters,
            searchFields: ['employeeName', 'exitType', 'status', 'reason'],
        }),
        [enrichedExits, exitSearch.appliedFilters, exitSearch.searchInput],
    )

    const pending = exitList.filter((e) => e.status === 'pending').length
    const approved = exitList.filter((e) => e.status === 'approved').length
    const completed = exitList.filter((e) => e.status === 'completed').length

    const columns: ColumnDef<ExitRequest & { employeeName: string; employeeDepartment: string; employeeDesignation: string }>[] = useMemo(() => [
        {
            id: 'employee',
            header: 'Employee',
            cell: ({ row: { original: e } }) => (
                <div className="flex items-center gap-2.5 min-w-0">
                    <InitialsAvatar name={e.employeeName} size="sm" />
                    <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{e.employeeName}</p>
                        {e.employeeDesignation && (
                            <p className="text-[11px] text-muted-foreground truncate">{e.employeeDesignation}</p>
                        )}
                    </div>
                </div>
            ),
            size: 200,
        },
        {
            accessorKey: 'exitType',
            header: 'Exit Type',
            cell: ({ getValue }) => {
                const v = getValue() as string
                return (
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${exitTypeColor[v] ?? 'bg-gray-100 text-gray-700'}`}>
                        {exitTypeLabel[v] ?? v}
                    </span>
                )
            },
            size: 130,
        },
        {
            id: 'dates',
            header: 'Exit Date / LWD',
            cell: ({ row: { original: e } }) => (
                <div>
                    <p className="text-xs font-medium">{formatDate(e.exitDate)}</p>
                    {e.lastWorkingDay && (
                        <p className="text-[10px] text-muted-foreground">LWD: {formatDate(e.lastWorkingDay)}</p>
                    )}
                </div>
            ),
            size: 130,
        },
        {
            id: 'settlement',
            header: 'Settlement (AED)',
            cell: ({ row: { original: e } }) => (
                <div>
                    <p className="text-sm font-semibold text-primary">{fmt(e.totalSettlement)}</p>
                    {e.settlementPaid && (
                        <p className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="h-3 w-3" /> Paid
                        </p>
                    )}
                </div>
            ),
            size: 150,
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ getValue }) => {
                const s = getValue() as string
                return (
                    <Badge variant={statusVariant[s] ?? 'secondary'} className="capitalize text-[11px]">
                        {s}
                    </Badge>
                )
            },
            size: 110,
        },
        {
            id: 'actions',
            header: '',
            cell: ({ row: { original: e } }) => {
                if (!canManage) return null
                return (
                    <div className="flex gap-1.5 justify-end">
                        {e.status === 'pending' && (
                            <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => approve.mutate(e.id, {
                                    onSuccess: () => toast.success('Approved', 'Exit request approved.'),
                                    onError: () => toast.error('Failed', 'Could not approve exit.'),
                                })}
                                disabled={approve.isPending}
                            >
                                Approve
                            </Button>
                        )}
                        {e.status === 'approved' && !e.settlementPaid && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => markPaid.mutate(e.id, {
                                    onSuccess: () => toast.success('Settlement paid', 'Settlement marked as paid.'),
                                    onError: () => toast.error('Failed', 'Could not update settlement.'),
                                })}
                                disabled={markPaid.isPending}
                            >
                                <DollarSign className="h-3 w-3 mr-1" /> Mark Paid
                            </Button>
                        )}
                    </div>
                )
            },
            size: 140,
        },
    ], [canManage, approve, markPaid])

    return (
        <PageWrapper>
            <PageHeader
                title={t('exit.title')}
                description={t('exit.description')}
                actions={
                    canManage && (
                        <Button size="sm" leftIcon={<UserMinus className="h-3.5 w-3.5" />} onClick={() => { setShowDialog(true); setStep('form') }}>
                            Initiate Exit
                        </Button>
                    )
                }
            />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCardCompact label="Total Exits" value={exitList.length} icon={LogOut} color="blue" loading={isLoading} />
                <KpiCardCompact label="Pending" value={pending} icon={Clock} color="amber" loading={isLoading} />
                <KpiCardCompact label="Approved" value={approved} icon={CheckCircle2} color="green" loading={isLoading} />
                <KpiCardCompact label="Completed" value={completed} icon={CheckCircle2} color="cyan" loading={isLoading} />
            </div>

            <Card>
                <CardHeader className="flex-row items-start sm:items-center justify-between gap-3 flex-wrap">
                    <div>
                        <CardTitle className="text-base">All Exit Requests</CardTitle>
                        <CardDescription className="mt-0.5">
                            {exitList.length} total records
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns as ColumnDef<ExitRequest>[]}
                        data={filteredExits as ExitRequest[]}
                        isLoading={isLoading}
                        advancedFilter={{
                            search: exitSearch,
                            filters: EXIT_FILTERS,
                            placeholder: 'Search by employee, exit type, reason…',
                        }}
                        pageSize={10}
                        emptyMessage={exitList.length === 0 ? 'No exit requests yet.' : 'No results match your filters.'}
                    />
                </CardContent>
            </Card>

            {/* Initiate Exit Dialog */}
            <Dialog open={showDialog} onOpenChange={(o) => { if (!initiate.isPending) setShowDialog(o) }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {step === 'form' ? 'Initiate Employee Exit' : 'Settlement Preview'}
                        </DialogTitle>
                    </DialogHeader>

                    {step === 'form' && (
                        <div className="space-y-4 py-2">
                            <div className="space-y-1.5">
                                <Label>Employee</Label>
                                <Select value={form.employeeId} onValueChange={v => set('employeeId', v)}>
                                    <SelectTrigger><SelectValue placeholder="Select employee…" /></SelectTrigger>
                                    <SelectContent>
                                        {empList.map((e: any) => (
                                            <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Exit Type</Label>
                                <Select value={form.exitType} onValueChange={v => set('exitType', v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="resignation">Resignation</SelectItem>
                                        <SelectItem value="termination">Termination</SelectItem>
                                        <SelectItem value="contract_end">Contract End</SelectItem>
                                        <SelectItem value="retirement">Retirement</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Exit Date</Label>
                                    <DatePicker value={form.exitDate} min={new Date().toISOString().split('T')[0]} onChange={v => set('exitDate', v)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Last Working Day</Label>
                                    <DatePicker value={form.lastWorkingDay} min={form.exitDate || new Date().toISOString().split('T')[0]} onChange={v => set('lastWorkingDay', v)} />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Notice Period (days)</Label>
                                <NumericInput decimal={false} value={form.noticePeriodDays} onChange={e => set('noticePeriodDays', Number(e.target.value))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Reason</Label>
                                <Textarea value={form.reason} onChange={e => set('reason', e.target.value)} rows={2} placeholder="Reason for exit…" />
                            </div>
                        </div>
                    )}

                    {step === 'preview' && previewLoading && (
                        <div className="py-10 text-center text-sm text-muted-foreground">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-3" />
                            Calculating settlement…
                        </div>
                    )}

                    {step === 'preview' && preview && !previewLoading && (
                        <div className="space-y-4 py-2">
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                                <InitialsAvatar name={preview.employeeName} size="sm" />
                                <div>
                                    <p className="text-sm font-semibold">{preview.employeeName}</p>
                                    <p className="text-xs text-muted-foreground">{preview.yearsOfService} years of service · {exitTypeLabel[form.exitType]}</p>
                                </div>
                            </div>
                            <div className="divide-y rounded-lg border overflow-hidden text-sm">
                                {[
                                    ['Gratuity (UAE Labour Law)', fmt(preview.gratuityAmount)],
                                    [`Leave Encashment (${preview.unusedLeaveDays} days)`, fmt(preview.leaveEncashmentAmount)],
                                    ['Unpaid Salary (current month)', fmt(preview.unpaidSalaryAmount)],
                                    ['Deductions', fmt(preview.deductions)],
                                ].map(([label, val]) => (
                                    <div key={label} className="flex justify-between px-4 py-2.5">
                                        <span className="text-muted-foreground">{label}</span>
                                        <span className="font-medium">{val}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between px-4 py-3 bg-muted/50 font-semibold">
                                    <span>Total Settlement</span>
                                    <span className="text-primary text-base">{fmt(preview.totalSettlement)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        {step === 'form' && (
                            <>
                                <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
                                <Button
                                    onClick={() => setStep('preview')}
                                    disabled={!form.employeeId || !form.exitDate || !form.lastWorkingDay}
                                >
                                    Preview Settlement
                                </Button>
                            </>
                        )}
                        {step === 'preview' && (
                            <>
                                <Button variant="outline" onClick={() => setStep('form')}>Back</Button>
                                <Button onClick={handleSubmit} disabled={initiate.isPending || previewLoading}>
                                    {initiate.isPending ? 'Submitting…' : 'Confirm & Submit'}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageWrapper>
    )
}
