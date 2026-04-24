// Shared helpers used by OnboardingPage and OnboardingDetailPage
import { Badge } from '@/components/ui/primitives'
import type { OnboardingStep, OnboardingStepStatus } from '@/hooks/useOnboarding'
import type { FilterConfig, QuickFilter } from '@/lib/filters'
import { Activity, AlertTriangle, BarChart3, Calendar, CheckCircle2, Clock, PauseCircle, UserPlus } from 'lucide-react'

export const ONBOARDING_TEMPLATE_STEPS = [
    { title: 'HR documentation & contracts', owner: 'HR', slaDays: 1 },
    { title: 'IT equipment setup & laptop handover', owner: 'IT', slaDays: 1 },
    { title: 'System access & account creation', owner: 'IT', slaDays: 2 },
    { title: 'Access card & office orientation', owner: 'Admin', slaDays: 2 },
    { title: 'Introduction to team & manager', owner: 'Manager', slaDays: 3 },
    { title: 'Employee handbook & policy review', owner: 'HR', slaDays: 5 },
    { title: 'Benefits enrollment & payroll setup', owner: 'HR', slaDays: 7 },
    { title: 'Compliance & safety training', owner: 'HR', slaDays: 10 },
    { title: '30-day check-in with manager', owner: 'Manager', slaDays: 30 },
]

export const ONBOARDING_STATUS_LABEL: Record<OnboardingStepStatus, string> = {
    pending: 'Pending',
    in_progress: 'In progress',
    completed: 'Completed',
    overdue: 'Overdue',
}

export function isStepOverdue(step: OnboardingStep): boolean {
    if (step.status === 'completed') return false
    if (!step.dueDate) return false
    return new Date(step.dueDate) < new Date(new Date().toDateString())
}

export function deriveSteps(steps: OnboardingStep[]): OnboardingStep[] {
    return (steps ?? []).map((s) => ({ ...s, status: isStepOverdue(s) ? 'overdue' : s.status }))
}

export function progressTone(progress: number): { color: string; label: string } {
    if (progress >= 100) return { color: 'text-success', label: 'Completed' }
    if (progress >= 50) return { color: 'text-blue-600', label: 'On track' }
    if (progress > 0) return { color: 'text-warning', label: 'In progress' }
    return { color: 'text-muted-foreground', label: 'Not started' }
}

export function daysUntil(dateStr: string | null | undefined): number | null {
    if (!dateStr) return null
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    d.setHours(0, 0, 0, 0)
    return Math.round((d.getTime() - today.getTime()) / (24 * 3600 * 1000))
}

export function DueBadge({ dueDate, status }: { dueDate?: string | null; status: OnboardingStepStatus }) {
    if (status === 'completed') return null
    const days = daysUntil(dueDate)
    if (days === null) return null
    if (days < 0) return <Badge variant="destructive" className="text-[10px]">{Math.abs(days)}d overdue</Badge>
    if (days === 0) return <Badge variant="warning" className="text-[10px]">Due today</Badge>
    if (days <= 3) return <Badge variant="warning" className="text-[10px]">In {days}d</Badge>
    if (days <= 7) return <Badge variant="info" className="text-[10px]">In {days}d</Badge>
    return <Badge variant="secondary" className="text-[10px]">In {days}d</Badge>
}

export function StatusPill({ status }: { status: OnboardingStepStatus }) {
    return (
        <Badge
            variant={status === 'completed' ? 'success' : status === 'in_progress' ? 'info' : status === 'overdue' ? 'destructive' : 'secondary'}
            className="text-[10px] capitalize shrink-0"
        >
            {ONBOARDING_STATUS_LABEL[status]}
        </Badge>
    )
}

export const ONBOARDING_FILTERS: FilterConfig[] = [
    {
        name: 'status', label: 'Status', type: 'select',
        icon: Activity,
        options: [
            { value: 'not_started', label: 'Not started' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'completed', label: 'Completed' },
        ],
    },
    { name: 'department', label: 'Department', type: 'text', icon: UserPlus, placeholder: 'e.g. Finance' },
    { name: 'designation', label: 'Role', type: 'text', icon: UserPlus, placeholder: 'e.g. Accountant' },
    {
        name: 'progress', label: 'Progress %', type: 'number_range', icon: BarChart3,
        min: 0, max: 100, step: 5, suffix: '%',
    },
    { name: 'startDate', label: 'Start date', type: 'date_range', icon: Calendar },
    { name: 'dueDate', label: 'Due date', type: 'date_range', icon: Clock },
    {
        name: 'overdue', label: 'Overdue steps only', type: 'toggle', icon: AlertTriangle,
    },
]

export const ONBOARDING_QUICK_FILTERS: QuickFilter[] = [
    {
        name: 'overdue', label: 'Overdue', icon: AlertTriangle,
        filter: { overdue: { operator: 'is', value: true } },
    },
    {
        name: 'in_progress', label: 'In progress', icon: Activity,
        filter: { status: { operator: 'equals', value: 'in_progress' } },
    },
    {
        name: 'not_started', label: 'Not started', icon: PauseCircle,
        filter: { status: { operator: 'equals', value: 'not_started' } },
    },
    {
        name: 'completed', label: 'Completed', icon: CheckCircle2,
        filter: { status: { operator: 'equals', value: 'completed' } },
    },
]
