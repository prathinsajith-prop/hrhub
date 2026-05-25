// ─── Public Exit Interview ───────────────────────────────────────────────────
// Standalone page reached via the email link "complete your exit interview".
// Renders without any portal chrome and does not require login — auth comes
// from the signed token in the URL.
//
// Flow:
//   1. Read token from /exit-interview/by-token/:token
//   2. GET the bundle (exit context + questions + prior responses)
//   3. Render form with type-aware inputs
//   4. POST answers; on success show a friendly thank-you screen
//
// Errors:
//   • 401 from the API → invalid / expired link → render an explainer
//   • 404 → exit no longer exists → render an explainer
//   • Any other error → toast + keep the form open

import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CheckCircle2, ExternalLink, MessageSquare, Send, Star, AlertCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
    useTokenInterviewBundle,
    useSubmitTokenInterviewResponses,
    type InterviewQuestion,
    type InterviewResponse,
    type QuestionType,
} from '@/hooks/useMyExit'

type DraftValue = string | string[] | number | null

export default function PublicExitInterviewPage() {
    const { token } = useParams<{ token: string }>()
    const { data, isLoading, isError, error } = useTokenInterviewBundle(token ?? null)

    if (!token) {
        return <ErrorShell title="Missing link" body="The exit-interview link is incomplete. Please check the URL or contact HR." />
    }

    if (isLoading) {
        return <SkeletonShell />
    }

    const apiErr = error as { statusCode?: number; data?: { reason?: string } } | undefined
    if (isError) {
        const code = apiErr?.statusCode
        const reason = apiErr?.data?.reason
        if (code === 401 || reason === 'expired') {
            return <ErrorShell title="Link expired" body="This exit-interview link is no longer valid. Please ask HR to send you a new one." />
        }
        if (code === 404) {
            return <ErrorShell title="Exit not found" body="We could not find an exit request for this link. Please contact HR." />
        }
        return <ErrorShell title="Could not load interview" body="Something went wrong. Please try again later." />
    }

    if (!data) return <SkeletonShell />

    return <PublicInterviewForm token={token} bundle={data} />
}

// ─── Layouts ───────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 py-8 px-4">
            <div className="max-w-2xl mx-auto space-y-5">{children}</div>
        </div>
    )
}

function SkeletonShell() {
    return (
        <PageShell>
            <Skeleton className="h-12 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
        </PageShell>
    )
}

function ErrorShell({ title, body }: { title: string; body: string }) {
    return (
        <PageShell>
            <div className="rounded-2xl border bg-card p-8 text-center space-y-3">
                <div className="size-12 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
                    <AlertCircle className="size-6" />
                </div>
                <h1 className="text-lg font-semibold">{title}</h1>
                <p className="text-sm text-muted-foreground">{body}</p>
            </div>
        </PageShell>
    )
}

// ─── Form ──────────────────────────────────────────────────────────────────

function PublicInterviewForm({ token, bundle }: { token: string; bundle: NonNullable<ReturnType<typeof useTokenInterviewBundle>['data']> }) {
    const submit = useSubmitTokenInterviewResponses(token)

    const responseByQid = new Map<string, InterviewResponse>(
        bundle.responses.map((r) => [r.questionId ?? '', r]),
    )
    const initialDrafts: Record<string, DraftValue> = {}
    for (const q of bundle.questions) {
        const r = responseByQid.get(q.id)
        initialDrafts[q.id] = r ? decodeAnswer(q.questionType, r) : q.questionType === 'multi_choice' ? [] : null
    }
    const [drafts, setDrafts] = useState<Record<string, DraftValue>>(initialDrafts)
    const [submitted, setSubmitted] = useState(bundle.responses.length > 0)
    const [thanked, setThanked] = useState(false)

    function setDraft(qid: string, value: DraftValue) {
        setDrafts((d) => ({ ...d, [qid]: value }))
    }

    async function send() {
        for (const q of bundle.questions.filter((q) => q.required)) {
            const v = drafts[q.id]
            if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) {
                toast.error('Please answer every required question before submitting.')
                return
            }
        }
        const answers = bundle.questions.map((q) => ({
            questionId: q.id,
            questionSnapshot: q.questionText,
            answerText: encodeAsText(q.questionType, drafts[q.id]),
            answerValue: encodeAsValue(q.questionType, drafts[q.id]),
        }))
        try {
            await submit.mutateAsync(answers)
            setSubmitted(true)
            setThanked(true)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not submit responses.')
        }
    }

    if (thanked) {
        return (
            <PageShell>
                <div className="rounded-2xl border bg-card p-10 text-center space-y-3">
                    <div className="size-14 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                        <CheckCircle2 className="size-7" />
                    </div>
                    <h1 className="text-xl font-semibold">Thank you</h1>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                        Your responses have been recorded and shared with HR. We wish you all the best for what comes next.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => setThanked(false)} className="mt-2">
                        Review my answers
                    </Button>
                </div>
            </PageShell>
        )
    }

    return (
        <PageShell>
            {/* Header */}
            <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
                    <MessageSquare className="size-3.5" />
                    Exit Interview
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">
                    {bundle.exit.employeeName ? `Hi ${bundle.exit.employeeName.split(' ')[0]} 👋` : 'Hi 👋'}
                </h1>
                <p className="text-sm text-muted-foreground">
                    Your feedback helps us improve. This goes directly to HR and is recorded in your exit file.
                </p>
            </div>

            {/* Exit context card */}
            <div className="rounded-xl border bg-card p-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <p className="text-sm font-medium capitalize">{bundle.exit.exitType.replace('_', ' ')}</p>
                    <p className="text-xs text-muted-foreground">
                        Last working day: <span className="font-medium text-foreground">{bundle.exit.lastWorkingDay}</span>
                    </p>
                </div>
                {submitted && (
                    <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-500">
                        <CheckCircle2 className="size-3 me-1" /> Submitted
                    </Badge>
                )}
            </div>

            {/* Questions */}
            {bundle.questions.length === 0 ? (
                <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
                    No interview questions configured. You can close this page.
                </div>
            ) : (
                <ol className="space-y-3">
                    {bundle.questions.map((q, idx) => (
                        <li key={q.id} className="rounded-xl border bg-card p-4">
                            <div className="flex items-start gap-3">
                                <span className="size-7 rounded-md bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                                    {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0 space-y-2">
                                    <div className="flex items-start gap-2 flex-wrap">
                                        <p className="text-sm font-medium">{q.questionText}</p>
                                        {q.required && (
                                            <Badge variant="secondary" className="text-[10px] shrink-0">Required</Badge>
                                        )}
                                    </div>
                                    <AnswerInput question={q} value={drafts[q.id] ?? null} onChange={(v) => setDraft(q.id, v)} />
                                </div>
                            </div>
                        </li>
                    ))}
                </ol>
            )}

            {bundle.questions.length > 0 && (
                <div className="rounded-xl border bg-card p-4 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <ExternalLink className="size-3" />
                        This link is private to you. Don’t forward it.
                    </p>
                    <Button onClick={send} disabled={submit.isPending}>
                        <Send className="size-3.5 me-1" />
                        {submit.isPending ? 'Sending…' : submitted ? 'Update responses' : 'Submit responses'}
                    </Button>
                </div>
            )}
        </PageShell>
    )
}

// ─── Per-question input (mirrors MyExitInterviewPage) ──────────────────────

function AnswerInput({ question, value, onChange }: { question: InterviewQuestion; value: DraftValue; onChange: (v: DraftValue) => void }) {
    const type = question.questionType
    if (type === 'short_text') {
        return <Input value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="Type your answer…" />
    }
    if (type === 'long_text') {
        return <Textarea rows={3} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="Type your answer…" />
    }
    if (type === 'yes_no') {
        return (
            <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant={value === 'yes' ? 'default' : 'outline'} onClick={() => onChange('yes')} aria-label="Answer Yes">Yes</Button>
                <Button type="button" size="sm" variant={value === 'no' ? 'default' : 'outline'} onClick={() => onChange('no')} aria-label="Answer No">No</Button>
            </div>
        )
    }
    if (type === 'rating') {
        const rating = typeof value === 'number' ? value : 0
        return (
            <div className="flex items-center gap-1 flex-wrap">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                        key={n}
                        type="button"
                        onClick={() => onChange(n)}
                        className={cn(
                            'size-8 rounded text-xs font-semibold transition-colors',
                            rating >= n ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20',
                        )}
                    >
                        {n}
                    </button>
                ))}
                {rating > 0 && (
                    <span className="text-xs text-muted-foreground ms-2 tabular-nums flex items-center gap-1">
                        <Star className="size-3 text-amber-500 fill-amber-500" />
                        {rating} / 10
                    </span>
                )}
            </div>
        )
    }
    if (type === 'single_choice') {
        return (
            <div className="flex flex-col gap-1.5">
                {(question.options ?? []).map((o) => (
                    <label key={o} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input type="radio" name={question.id} checked={value === o} onChange={() => onChange(o)} className="size-4 accent-primary" aria-label={o} />
                        <span>{o}</span>
                    </label>
                ))}
            </div>
        )
    }
    const arr = Array.isArray(value) ? value : []
    return (
        <div className="flex flex-col gap-1.5">
            {(question.options ?? []).map((o) => {
                const checked = arr.includes(o)
                return (
                    <label key={o} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onChange(checked ? arr.filter((x) => x !== o) : [...arr, o])}
                            className="size-4 accent-primary"
                            aria-label={o}
                        />
                        <span>{o}</span>
                    </label>
                )
            })}
        </div>
    )
}

// ─── Codec (mirrors MyExitInterviewPage) ───────────────────────────────────

function decodeAnswer(type: QuestionType, r: InterviewResponse): DraftValue {
    if (type === 'rating') {
        if (typeof r.answerValue === 'number') return r.answerValue
        const parsed = Number(r.answerText ?? '')
        return Number.isFinite(parsed) ? parsed : null
    }
    if (type === 'yes_no') {
        const raw = (r.answerValue ?? r.answerText ?? '').toString().toLowerCase()
        return raw === 'yes' || raw === 'true' ? 'yes' : raw === 'no' || raw === 'false' ? 'no' : null
    }
    if (type === 'multi_choice') return Array.isArray(r.answerValue) ? (r.answerValue as string[]) : []
    if (type === 'single_choice') {
        if (Array.isArray(r.answerValue)) return (r.answerValue[0] as string) ?? null
        if (typeof r.answerValue === 'string') return r.answerValue
        return r.answerText ?? null
    }
    return r.answerText ?? ''
}

function encodeAsText(type: QuestionType, value: DraftValue): string | undefined {
    if (value == null) return undefined
    if (type === 'short_text' || type === 'long_text') return typeof value === 'string' ? value : undefined
    if (type === 'yes_no' || type === 'single_choice') return typeof value === 'string' ? value : undefined
    if (type === 'rating') return typeof value === 'number' ? String(value) : undefined
    return undefined
}

function encodeAsValue(type: QuestionType, value: DraftValue): unknown {
    if (value == null) return null
    if (type === 'rating') return typeof value === 'number' ? value : null
    if (type === 'multi_choice') return Array.isArray(value) ? value : []
    if (type === 'single_choice') return typeof value === 'string' ? value : null
    if (type === 'yes_no') return value === 'yes'
    return null
}
