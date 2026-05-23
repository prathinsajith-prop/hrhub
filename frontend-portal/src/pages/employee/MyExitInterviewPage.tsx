// ─── My Exit Interview ───────────────────────────────────────────────────────
// Employee-facing page for the configured exit interview. Visible only when
// the current employee has an in-flight exit on file; otherwise it shows a
// friendly empty state.
//
// Single round-trip against `/my-exit/interview` returns the exit row + the
// active questions + any prior responses, so the page renders without a
// flash of empty state.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CheckCircle2, MessageSquare, Send, Star, Lock } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
    useMyInterviewBundle,
    useSubmitMyInterviewResponses,
    type InterviewQuestion,
    type InterviewResponse,
    type QuestionType,
} from '@/hooks/useMyExit'

type DraftValue = string | string[] | number | null

export default function MyExitInterviewPage() {
    const { t } = useTranslation()
    const { data, isLoading, isError, error } = useMyInterviewBundle()

    if (isLoading) {
        return (
            <div className="space-y-4">
                <PageHeader title={t('myExitInterview.title', { defaultValue: 'Exit Interview' })} />
                <Skeleton className="h-96 w-full" />
            </div>
        )
    }

    // 404 from the API => no exit on file. Show a friendly empty state.
    const apiErr = error as { statusCode?: number } | undefined
    if (isError && apiErr?.statusCode === 404) {
        return (
            <div className="space-y-4">
                <PageHeader title={t('myExitInterview.title', { defaultValue: 'Exit Interview' })} />
                <EmptyState
                    icon={<MessageSquare className="size-6 text-muted-foreground" />}
                    title={t('myExitInterview.emptyTitle', { defaultValue: 'No exit interview pending' })}
                    description={t('myExitInterview.emptyBody', {
                        defaultValue: 'This page is only available when HR has initiated your exit. You don\'t have anything to fill in right now.',
                    })}
                />
            </div>
        )
    }

    if (!data) {
        return (
            <div className="space-y-4">
                <PageHeader title={t('myExitInterview.title', { defaultValue: 'Exit Interview' })} />
                <EmptyState
                    icon={<MessageSquare className="size-6 text-muted-foreground" />}
                    title={t('myExitInterview.unavailable', { defaultValue: 'Interview unavailable' })}
                    description={t('myExitInterview.tryAgain', { defaultValue: 'Could not load the interview. Please try again later.' })}
                />
            </div>
        )
    }

    return <InterviewForm bundle={data} />
}

function InterviewForm({ bundle }: { bundle: NonNullable<ReturnType<typeof useMyInterviewBundle>['data']> }) {
    const { t } = useTranslation()
    const submit = useSubmitMyInterviewResponses(bundle.exit.id)

    // Seed drafts from prior responses on first render.
    const responseByQid = new Map<string, InterviewResponse>(
        bundle.responses.map(r => [r.questionId ?? '', r]),
    )
    const initialDrafts: Record<string, DraftValue> = {}
    for (const q of bundle.questions) {
        const r = responseByQid.get(q.id)
        initialDrafts[q.id] = r ? decodeAnswer(q.questionType, r) : q.questionType === 'multi_choice' ? [] : null
    }
    const [drafts, setDrafts] = useState<Record<string, DraftValue>>(initialDrafts)
    const submitted = bundle.responses.length > 0
    const [editing, setEditing] = useState(!submitted)

    function setDraft(qid: string, value: DraftValue) {
        setDrafts(d => ({ ...d, [qid]: value }))
    }

    async function send() {
        // Validate required fields.
        for (const q of bundle.questions.filter(q => q.required)) {
            const v = drafts[q.id]
            if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) {
                toast.error(t('myExitInterview.missingRequired', {
                    defaultValue: 'Please answer every required question before submitting.',
                }))
                return
            }
        }
        const answers = bundle.questions.map(q => ({
            questionId: q.id,
            questionSnapshot: q.questionText,
            answerText: encodeAsText(q.questionType, drafts[q.id]),
            answerValue: encodeAsValue(q.questionType, drafts[q.id]),
        }))
        try {
            await submit.mutateAsync(answers)
            toast.success(t('myExitInterview.submitted', { defaultValue: 'Thanks — your responses have been recorded.' }))
            setEditing(false)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Submit failed')
        }
    }

    return (
        <div className="space-y-4">
            <PageHeader
                title={t('myExitInterview.title', { defaultValue: 'Exit Interview' })}
                subtitle={t('myExitInterview.description', {
                    defaultValue: 'Your feedback helps us improve. Your responses go directly to HR.',
                })}
            />

            {/* Exit context */}
            <GlassCard className="p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                        <p className="text-sm font-semibold capitalize">{bundle.exit.exitType.replace('_', ' ')}</p>
                        <p className="text-xs text-muted-foreground">
                            {t('myExitInterview.lwd', { defaultValue: 'Last working day' })}:{' '}
                            <span className="font-medium text-foreground">{bundle.exit.lastWorkingDay}</span>
                        </p>
                    </div>
                    {submitted && !editing && (
                        <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-500">
                            <CheckCircle2 className="size-3 me-1" />
                            {t('myExitInterview.submittedBadge', { defaultValue: 'Submitted' })}
                        </Badge>
                    )}
                </div>
            </GlassCard>

            {/* Questions */}
            {bundle.questions.length === 0 ? (
                <EmptyState
                    icon={<MessageSquare className="size-6 text-muted-foreground" />}
                    title={t('myExitInterview.noQuestionsTitle', { defaultValue: 'No questions yet' })}
                    description={t('myExitInterview.noQuestionsBody', {
                        defaultValue: 'Your employer has not configured an exit interview. Nothing to do here.',
                    })}
                />
            ) : (
                <ol className="space-y-3">
                    {bundle.questions.map((q, idx) => (
                        <li key={q.id}>
                            <GlassCard className="p-4 space-y-2">
                                <div className="flex items-start gap-3">
                                    <span className="size-7 rounded-md bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                                        {idx + 1}
                                    </span>
                                    <div className="flex-1 min-w-0 space-y-2">
                                        <div className="flex items-start gap-2 flex-wrap">
                                            <p className="text-sm font-medium">{q.questionText}</p>
                                            {q.required && (
                                                <Badge variant="secondary" className="text-[10px] shrink-0">
                                                    {t('common.required', { defaultValue: 'Required' })}
                                                </Badge>
                                            )}
                                        </div>
                                        {editing ? (
                                            <AnswerInput question={q} value={drafts[q.id] ?? null} onChange={(v) => setDraft(q.id, v)} />
                                        ) : (
                                            <AnswerReadOnly question={q} value={drafts[q.id] ?? null} />
                                        )}
                                    </div>
                                </div>
                            </GlassCard>
                        </li>
                    ))}
                </ol>
            )}

            {bundle.questions.length > 0 && (
                <GlassCard className="p-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Lock className="size-3" />
                            {t('myExitInterview.privacyNote', {
                                defaultValue: 'Responses are visible only to HR and recorded in your exit file.',
                            })}
                        </p>
                        {editing ? (
                            <div className="flex items-center gap-2">
                                {submitted && (
                                    <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                                        {t('common.cancel', { defaultValue: 'Cancel' })}
                                    </Button>
                                )}
                                <Button size="sm" onClick={send} disabled={submit.isPending}>
                                    <Send className="size-3.5 me-1" />
                                    {submit.isPending
                                        ? t('myExitInterview.sending', { defaultValue: 'Sending…' })
                                        : submitted
                                            ? t('myExitInterview.update', { defaultValue: 'Update responses' })
                                            : t('myExitInterview.submit', { defaultValue: 'Submit responses' })}
                                </Button>
                            </div>
                        ) : (
                            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                                {t('myExitInterview.edit', { defaultValue: 'Edit responses' })}
                            </Button>
                        )}
                    </div>
                </GlassCard>
            )}
        </div>
    )
}

// ─── Per-question input ─────────────────────────────────────────────────────

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
                <Button type="button" size="sm" variant={value === 'yes' ? 'default' : 'outline'} onClick={() => onChange('yes')}>Yes</Button>
                <Button type="button" size="sm" variant={value === 'no' ? 'default' : 'outline'} onClick={() => onChange('no')}>No</Button>
            </div>
        )
    }
    if (type === 'rating') {
        const rating = typeof value === 'number' ? value : 0
        return (
            <div className="flex items-center gap-1 flex-wrap">
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
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
                {rating > 0 && <span className="text-xs text-muted-foreground ms-2 tabular-nums">{rating} / 10</span>}
            </div>
        )
    }
    if (type === 'single_choice') {
        return (
            <div className="flex flex-col gap-1.5">
                {(question.options ?? []).map(o => (
                    <label key={o} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input type="radio" name={question.id} checked={value === o} onChange={() => onChange(o)} className="size-4 accent-primary" />
                        <span>{o}</span>
                    </label>
                ))}
            </div>
        )
    }
    // multi_choice
    const arr = Array.isArray(value) ? value : []
    return (
        <div className="flex flex-col gap-1.5">
            {(question.options ?? []).map(o => {
                const checked = arr.includes(o)
                return (
                    <label key={o} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onChange(checked ? arr.filter(x => x !== o) : [...arr, o])}
                            className="size-4 accent-primary"
                        />
                        <span>{o}</span>
                    </label>
                )
            })}
        </div>
    )
}

function AnswerReadOnly({ question, value }: { question: InterviewQuestion; value: DraftValue }) {
    if (value == null || (Array.isArray(value) && value.length === 0)) {
        return <p className="text-xs text-muted-foreground italic">— (no response)</p>
    }
    if (question.questionType === 'rating' && typeof value === 'number') {
        return (
            <div className="flex items-center gap-1.5">
                <Star className="size-3.5 text-amber-500 fill-amber-500" />
                <span className="text-sm font-medium tabular-nums">{value}</span>
                <span className="text-xs text-muted-foreground">/ 10</span>
            </div>
        )
    }
    if (question.questionType === 'yes_no') {
        const yes = value === 'yes'
        return <Badge variant={yes ? 'default' : 'secondary'} className={cn(yes && 'bg-emerald-500 hover:bg-emerald-500')}>{yes ? 'Yes' : 'No'}</Badge>
    }
    if (Array.isArray(value)) {
        return <div className="flex flex-wrap gap-1">{value.map(v => <Badge key={v} variant="secondary" className="text-[10px]">{v}</Badge>)}</div>
    }
    return <p className="text-sm whitespace-pre-wrap">{value as string}</p>
}

// ─── Codec — DB ⇄ draft ─────────────────────────────────────────────────────

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
