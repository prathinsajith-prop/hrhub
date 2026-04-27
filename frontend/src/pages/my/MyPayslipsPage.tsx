import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Receipt, Download } from 'lucide-react'
import { useMyPayslips } from '@/hooks/useMe'
import { useAuthStore } from '@/store/authStore'
import { useDownloadPayslip } from '@/hooks/usePayroll'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const STATUS_VARIANT: Record<string, string> = {
    paid: 'success', wps_submitted: 'success', approved: 'default',
    processing: 'warning', draft: 'secondary', failed: 'destructive',
}
const STATUS_LABELS: Record<string, string> = {
    paid: 'Paid', wps_submitted: 'WPS Submitted', approved: 'Approved',
    processing: 'Processing', draft: 'Draft', failed: 'Failed',
}

function fmt(val: string | number) {
    return Number(val).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function MyPayslipsPage() {
    const user = useAuthStore(s => s.user)
    const employeeId = (user as { employeeId?: string } | null)?.employeeId
    const { data: payslips = [], isLoading } = useMyPayslips()
    const download = useDownloadPayslip()

    return (
        <PageWrapper>
            <PageHeader
                title="My Payslips"
                description="View and download your monthly payslips."
            />

            {!employeeId ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <Receipt className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Your account is not linked to an employee record.</p>
                </div>
            ) : isLoading ? (
                <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
            ) : payslips.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <Receipt className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No payslips yet. They appear here once payroll is processed.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {payslips.map(p => (
                        <div key={p.id} className="flex items-center gap-4 rounded-xl border px-4 py-3.5 bg-card">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <Receipt className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold">{MONTHS[p.month - 1]} {p.year}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Basic: AED {fmt(p.basicSalary)} · Gross: AED {fmt(p.grossSalary)} · Deductions: AED {fmt(p.deductions)}
                                </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <div className="text-right hidden sm:block">
                                    <p className="text-sm font-bold">AED {fmt(p.netSalary)}</p>
                                    <p className="text-[10px] text-muted-foreground">Net Pay</p>
                                </div>
                                <Badge variant={STATUS_VARIANT[p.runStatus] as 'success' | 'default' | 'warning' | 'secondary' | 'destructive'}>
                                    {STATUS_LABELS[p.runStatus] ?? p.runStatus}
                                </Badge>
                                {(p.runStatus === 'paid' || p.runStatus === 'wps_submitted' || p.runStatus === 'approved') && (
                                    <Button
                                        size="sm" variant="outline"
                                        className="gap-1.5"
                                        onClick={() => download.mutate(p.id)}
                                        disabled={download.isPending}
                                    >
                                        <Download className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">PDF</span>
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </PageWrapper>
    )
}
