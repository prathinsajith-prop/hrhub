import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Download, FileText, Sparkles, Star, TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/shared/EmptyState'
import {
    triggerWarningDownload,
    useEmployeeReviews,
    useEmployeeWarnings,
    useMyReviews,
    useMyWarnings,
    type PerformanceReview,
    type ReviewStatus,
    type Warning,
} from '@/hooks/usePerformance'
import { cn, formatDate } from '@/lib/utils'

type Props =
    | { variant: 'me'; employeeId?: undefined }
    | { variant: 'employee'; employeeId: string | undefined }

const STATUS_TONE: Record<ReviewStatus, string> = {
    draft: 'bg-muted text-muted-foreground',
    submitted: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
    acknowledged: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300',
    completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
}

const KPI_LABELS: Array<{ key: keyof PerformanceReview; label: string }> = [
    { key: 'qualityScore', label: 'Quality' },
    { key: 'productivityScore', label: 'Productivity' },
    { key: 'teamworkScore', label: 'Teamwork' },
    { key: 'attendanceScore', label: 'Attendance' },
    { key: 'initiativeScore', label: 'Initiative' },
]

/**
 * Performance hub: switches between Reviews and Warnings sub-tabs. Wraps both
 * data sources so a single component can render either the signed-in user's
 * record (`variant="me"`) or a specific team member's record for a manager.
 */
export function PerformanceCard(props: Props) {
    // Both pairs of hooks always run (Rules of Hooks). The "other" pair stays
    // disabled when employeeId is undefined, so it doesn't actually fire.
    const employeeId = props.variant === 'employee' ? props.employeeId : undefined
    const meReviews = useMyReviews()
    const otherReviews = useEmployeeReviews(employeeId)
    const meWarnings = useMyWarnings()
    const otherWarnings = useEmployeeWarnings(employeeId)
    const reviewsQuery = props.variant === 'me' ? meReviews : otherReviews
    const warningsQuery = props.variant === 'me' ? meWarnings : otherWarnings
    const reviews: PerformanceReview[] = reviewsQuery.data ?? []
    const warnings: Warning[] = warningsQuery.data ?? []

    return (
        <Card className="overflow-hidden border-border/70">
            <CardContent className="p-5">
                <Tabs defaultValue="reviews">
                    <TabsList>
                        <TabsTrigger value="reviews" className="gap-1.5">
                            <Sparkles className="size-3.5" />
                            Reviews
                            {reviews.length > 0 ? (
                                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
                                    {reviews.length}
                                </Badge>
                            ) : null}
                        </TabsTrigger>
                        <TabsTrigger value="warnings" className="gap-1.5">
                            <AlertTriangle className="size-3.5" />
                            Warnings
                            {warnings.length > 0 ? (
                                <Badge
                                    variant="secondary"
                                    className={cn(
                                        'ml-1 h-4 px-1.5 text-[10px]',
                                        'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
                                    )}
                                >
                                    {warnings.length}
                                </Badge>
                            ) : null}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="reviews">
                        <ReviewsList loading={reviewsQuery.isLoading} reviews={reviews} />
                    </TabsContent>

                    <TabsContent value="warnings">
                        <WarningsList loading={warningsQuery.isLoading} warnings={warnings} />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}

// ─── Reviews ──────────────────────────────────────────────────────────────

function ReviewsList({ loading, reviews }: { loading: boolean; reviews: PerformanceReview[] }) {
    if (loading) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
            </div>
        )
    }
    if (reviews.length === 0) {
        return (
            <EmptyState
                icon={<Sparkles className="size-5" />}
                title="No reviews yet"
                description="Your manager's published reviews will show up here."
            />
        )
    }
    return (
        <ul className="space-y-3">
            {reviews.map((r) => (
                <ReviewItem key={r.id} review={r} />
            ))}
        </ul>
    )
}

function ReviewItem({ review }: { review: PerformanceReview }) {
    const dateLabel = review.reviewDate ? formatDate(review.reviewDate) : formatDate(review.createdAt)
    return (
        <li className="rounded-lg border border-border/60 bg-card/40 p-4 transition-colors hover:bg-card/70">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{review.period}</span>
                        <Badge className={cn('border-0 text-[10px] uppercase tracking-wider', STATUS_TONE[review.status])}>
                            {review.status}
                        </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {dateLabel}
                        {review.reviewerName ? ` · Reviewer: ${review.reviewerName}` : ''}
                    </p>
                </div>
                <OverallRating value={review.overallRating} />
            </div>

            <KpiGrid review={review} />

            {review.strengths || review.improvements || review.goals || review.managerComments || review.employeeComments ? (
                <div className="mt-3 space-y-2 border-t border-border/60 pt-3 text-xs">
                    {review.strengths ? <TextRow label="Strengths" value={review.strengths} /> : null}
                    {review.improvements ? <TextRow label="Areas to improve" value={review.improvements} /> : null}
                    {review.goals ? <TextRow label="Goals" value={review.goals} /> : null}
                    {review.managerComments ? <TextRow label="Manager comments" value={review.managerComments} /> : null}
                    {review.employeeComments ? <TextRow label="Your comments" value={review.employeeComments} /> : null}
                </div>
            ) : null}
        </li>
    )
}

function OverallRating({ value }: { value: number | null }) {
    if (value == null) return null
    return (
        <div
            className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            title={`Overall rating ${value}/5`}
        >
            <Star className="size-3 fill-current" />
            {value}/5
        </div>
    )
}

function KpiGrid({ review }: { review: PerformanceReview }) {
    // Single pass — collect only labels whose KPI value is set, instead of
    // map→filter (which iterates twice and allocates the intermediate array).
    const entries: Array<{ label: string; value: number }> = []
    for (const { key, label } of KPI_LABELS) {
        const value = review[key] as number | null
        if (value != null) entries.push({ label, value })
    }
    if (entries.length === 0) return null
    return (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {entries.map((e) => (
                <KpiCell key={e.label} label={e.label} value={e.value} />
            ))}
        </div>
    )
}

function KpiCell({ label, value }: { label: string; value: number }) {
    const pct = Math.min(100, Math.max(0, (value / 5) * 100))
    return (
        <div className="space-y-1">
            <div className="flex items-baseline justify-between text-[11px]">
                <span className="truncate text-muted-foreground">{label}</span>
                <span className="font-semibold tabular-figures">{value}/5</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                    className={cn(
                        'h-full rounded-full transition-all',
                        value >= 4 ? 'bg-emerald-500' : value >= 3 ? 'bg-indigo-500' : value >= 2 ? 'bg-amber-500' : 'bg-rose-500',
                    )}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    )
}

function TextRow({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="size-3" />
                {label}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-foreground/90">{value}</p>
        </div>
    )
}

// ─── Warnings ─────────────────────────────────────────────────────────────

function WarningsList({ loading, warnings }: { loading: boolean; warnings: Warning[] }) {
    if (loading) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
            </div>
        )
    }
    if (warnings.length === 0) {
        return (
            <EmptyState
                icon={<AlertTriangle className="size-5" />}
                title="No warnings on record"
                description="A clean slate — keep it up."
            />
        )
    }
    return (
        <ul className="space-y-2">
            {warnings.map((w) => (
                <WarningItem key={w.id} warning={w} />
            ))}
        </ul>
    )
}

function WarningItem({ warning }: { warning: Warning }) {
    const [downloading, setDownloading] = useState(false)
    async function download() {
        if (downloading) return
        setDownloading(true)
        try {
            await triggerWarningDownload(warning.id)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Download failed')
        } finally {
            setDownloading(false)
        }
    }

    const isActive = !warning.expiryDate || new Date(warning.expiryDate) >= new Date()
    return (
        <li className="rounded-lg border border-border/60 bg-card/40 p-4">
            <div className="flex items-start gap-3">
                <span
                    className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-lg',
                        isActive
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                            : 'bg-muted text-muted-foreground',
                    )}
                >
                    <AlertTriangle className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">Warning</span>
                        <Badge
                            className={cn(
                                'border-0 text-[10px] uppercase tracking-wider',
                                isActive
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                                    : 'bg-muted text-muted-foreground',
                            )}
                        >
                            {isActive ? 'active' : 'expired'}
                        </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Issued {formatDate(warning.issueDate)}
                        {warning.expiryDate ? ` · Expires ${formatDate(warning.expiryDate)}` : ''}
                        {warning.createdByName ? ` · By ${warning.createdByName}` : ''}
                    </p>
                    {warning.reason ? (
                        <p className="mt-1.5 whitespace-pre-wrap text-xs text-foreground/90">{warning.reason}</p>
                    ) : null}
                    {warning.documentFileName ? (
                        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <FileText className="size-3" />
                            <span className="truncate">{warning.documentFileName}</span>
                        </div>
                    ) : null}
                </div>
                {warning.hasFile ? (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={download}
                        loading={downloading}
                        aria-label="Download warning letter"
                    >
                        <Download className="size-4" />
                        <span className="hidden sm:inline">Download</span>
                    </Button>
                ) : null}
            </div>
        </li>
    )
}
