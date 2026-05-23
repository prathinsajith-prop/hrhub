// ─── Exit Interview Section ──────────────────────────────────────────────────
// Stage-3 surface inside the Exit Detail wizard. Two modes:
//
//   • Editable (default until submitted): HR fills in each answer on behalf
//     of the leaver during the exit interview. A "Save responses" button at
//     the bottom POSTs all answers atomically.
//   • Read-only (after submission): same layout but answers render as values
//     instead of inputs. An "Edit" button flips back into editable mode if
//     HR wants to amend a response.
//
// Approval is gated server-side on at least one submitted response, so HR
// must save here before they can move forward in the wizard.
//
// Data sources:
//   • useInterviewQuestions()         — configured questions
//   • useExitInterviewResponses(id)   — prior submissions
//   • useSubmitInterviewResponses(id) — POST that overwrites all answers
//     (the backend wipes + reinserts inside a single transaction).

import { useState, useImperativeHandle, forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Clock, MessageSquare, Star, ListChecks, Save, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/overlays'
import {
    useInterviewQuestions,
    useExitInterviewResponses,
    useSubmitInterviewResponses,
} from '@/hooks/useOffboardingFlow'
import type {
    InterviewQuestion,
    ExitInterviewResponse,
    QuestionType,
} from '@/hooks/useOffboardingFlow'
import { cn } from '@/lib/utils'

/**
 * Shape stored locally as HR fills in each question. We hold a single
 * `value` per question that's normalised to the response payload at submit
 * time based on the question type.
 */
type DraftValue = string | string[] | number | null

interface ExitInterviewSectionProps {
    exitId: string
    /** True when the back-end has marked the interview as submitted at least once. */
    submitted: boolean
    /** Optional callback fired whenever the dirty flag flips. Used by the
     *  wizard to relabel its Next button "Save & Next" when there's unsaved
     *  work in this step. */
    onDirtyChange?: (dirty: boolean) => void
}

export interface ExitInterviewSectionHandle {
    /** Has the form been edited since last save? Used by the wizard's
     *  Save & Next button to decide whether to flush before advancing. */
    isDirty: () => boolean
    /** Persist any unsaved edits. Resolves once writes settle.
     *  Returns true on success; false if validation failed. */
    save: () => Promise<boolean>
}

export const ExitInterviewSection = forwardRef<
    ExitInterviewSectionHandle,
    ExitInterviewSectionProps
>(function ExitInterviewSection({ exitId, submitted, onDirtyChange }, ref) {
    const { t } = useTranslation()
    const questionsQ = useInterviewQuestions()
    const responsesQ = useExitInterviewResponses(exitId)
    const submit = useSubmitInterviewResponses(exitId)

    const questions = questionsQ.data ?? []
    const responses = responsesQ.data ?? []
    const responseByQid = new Map<string, ExitInterviewResponse>(
        responses.map((r) => [r.questionId ?? '', r]),
    )

    // Local draft state — seeded from existing responses the first time the
    // questions/responses pair settles, then owned by the user.
    const [drafts, setDrafts] = useState<Record<string, DraftValue>>({})
    const [seeded, setSeeded] = useState(false)
    const [editing, setEditing] = useState(!submitted)
    const [dirty, setDirty] = useState(false)

    // One-shot seed: questions + responses both loaded, draft is empty.
    if (!seeded && !questionsQ.isLoading && !responsesQ.isLoading && questions.length > 0) {
        const seed: Record<string, DraftValue> = {}
        for (const q of questions) {
            const r = responseByQid.get(q.id)
            if (r) seed[q.id] = decodeAnswer(q.questionType, r)
            else seed[q.id] = q.questionType === 'multi_choice' ? [] : null
        }
        setDrafts(seed)
        setSeeded(true)
    }

    function setDraft(qid: string, value: DraftValue) {
        setDrafts((d) => ({ ...d, [qid]: value }))
        if (!dirty) {
            setDirty(true)
            onDirtyChange?.(true)
        }
    }

    async function persist(): Promise<boolean> {
        if (questions.length === 0) return true
        // Validate: required questions must have a non-empty value.
        const required = questions.filter((q) => q.required)
        for (const q of required) {
            const v = drafts[q.id]
            if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) {
                toast.error(
                    t('exit.interview.requiredMissing', { defaultValue: 'Missing required answers' }),
                    t('exit.interview.requiredMissingDesc', {
                        defaultValue: 'Please answer every question marked required before saving.',
                    }),
                )
                return false
            }
        }

        const answers = questions.map((q) => ({
            questionId: q.id,
            questionSnapshot: q.questionText,
            answerText: encodeAsText(q.questionType, drafts[q.id]),
            answerValue: encodeAsValue(q.questionType, drafts[q.id]),
        }))
        try {
            await submit.mutateAsync(answers)
            setDirty(false)
            onDirtyChange?.(false)
            setEditing(false)
            toast.success(t('exit.interview.saved', { defaultValue: 'Responses saved' }))
            return true
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Save failed')
            return false
        }
    }

    useImperativeHandle(ref, () => ({
        isDirty: () => dirty,
        save: persist,
    }), [dirty, drafts, questions])

    const loading = questionsQ.isLoading || responsesQ.isLoading

    return (
        <div className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b">
                <MessageSquare className="size-3.5 text-muted-foreground" />
                <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                    {t('exit.interview.title', { defaultValue: 'Exit Interview' })}
                </span>
                <span className="text-xs text-muted-foreground ms-3">
                    {responses.length} / {questions.length} answered
                </span>
                {submitted ? (
                    <Badge variant="success" className="ms-auto text-[10px]">
                        <CheckCircle2 className="size-2.5 me-0.5" /> Submitted
                    </Badge>
                ) : (
                    <Badge variant="secondary" className="ms-auto text-[10px]">
                        <Clock className="size-2.5 me-0.5" /> Awaiting response
                    </Badge>
                )}
                {submitted && !editing && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs ms-2" onClick={() => setEditing(true)}>
                        <Pencil className="size-3 me-1" />
                        {t('exit.interview.edit', { defaultValue: 'Edit' })}
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="p-4">
                    <Skeleton className="h-32 w-full" />
                </div>
            ) : questions.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                    <ListChecks className="size-4 mx-auto mb-2 opacity-60" />
                    {t('exit.interview.empty', {
                        defaultValue:
                            'No interview questions configured. Add them under Org Settings → Offboarding Flow → Exit Interview.',
                    })}
                </div>
            ) : (
                <>
                    <ol className="divide-y">
                        {questions.map((q, idx) => (
                            <li key={q.id} className="px-4 py-3 flex items-start gap-3">
                                <span className="size-6 rounded-md bg-muted text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                                    {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0 space-y-2">
                                    <div className="flex items-start gap-2 flex-wrap">
                                        <p className="text-sm font-medium text-foreground">{q.questionText}</p>
                                        <Badge variant="outline" className="text-[10px] shrink-0">
                                            {questionTypeLabel(q.questionType)}
                                        </Badge>
                                        {q.required && (
                                            <Badge variant="secondary" className="text-[10px] shrink-0">
                                                Required
                                            </Badge>
                                        )}
                                    </div>
                                    {editing ? (
                                        <AnswerInput question={q} value={drafts[q.id] ?? null} onChange={(v) => setDraft(q.id, v)} />
                                    ) : (
                                        <AnswerDisplay question={q} value={drafts[q.id] ?? null} hasResponse={!!responseByQid.get(q.id)} />
                                    )}
                                </div>
                            </li>
                        ))}
                    </ol>

                    {editing && (
                        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-muted/20">
                            {submitted && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        // Restore drafts from saved responses and exit edit mode
                                        const reset: Record<string, DraftValue> = {}
                                        for (const q of questions) {
                                            const r = responseByQid.get(q.id)
                                            reset[q.id] = r ? decodeAnswer(q.questionType, r) : q.questionType === 'multi_choice' ? [] : null
                                        }
                                        setDrafts(reset)
                                        setDirty(false)
                                        onDirtyChange?.(false)
                                        setEditing(false)
                                    }}
                                >
                                    {t('common.cancel')}
                                </Button>
                            )}
                            <Button size="sm" onClick={persist} disabled={submit.isPending}>
                                <Save className="size-3.5 me-1" />
                                {submit.isPending
                                    ? t('exit.interview.saving', { defaultValue: 'Saving…' })
                                    : t('exit.interview.save', { defaultValue: 'Save responses' })}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
})

// ─── Per-question inputs ────────────────────────────────────────────────────

function AnswerInput({ question, value, onChange }: { question: InterviewQuestion; value: DraftValue; onChange: (v: DraftValue) => void }) {
    const type = question.questionType
    if (type === 'short_text') {
        return (
            <Input
                value={(value as string) ?? ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Type the response…"
                className="text-sm"
            />
        )
    }
    if (type === 'long_text') {
        return (
            <Textarea
                rows={3}
                value={(value as string) ?? ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Type the response…"
                className="text-sm"
            />
        )
    }
    if (type === 'yes_no') {
        const v = value === 'yes' ? 'yes' : value === 'no' ? 'no' : null
        return (
            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    size="sm"
                    variant={v === 'yes' ? 'default' : 'outline'}
                    onClick={() => onChange('yes')}
                >
                    Yes
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant={v === 'no' ? 'default' : 'outline'}
                    onClick={() => onChange('no')}
                >
                    No
                </Button>
            </div>
        )
    }
    if (type === 'rating') {
        const rating = typeof value === 'number' ? value : 0
        return (
            <div className="flex items-center gap-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                        key={n}
                        type="button"
                        onClick={() => onChange(n)}
                        className={cn(
                            'size-7 rounded text-xs font-semibold transition-colors',
                            rating >= n ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20',
                        )}
                    >
                        {n}
                    </button>
                ))}
                {rating > 0 && (
                    <span className="text-xs text-muted-foreground ms-2 tabular-nums">{rating} / 10</span>
                )}
            </div>
        )
    }
    if (type === 'single_choice') {
        const opts = question.options ?? []
        return (
            <div className="flex flex-col gap-1.5">
                {opts.map((o) => (
                    <label key={o} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                            type="radio"
                            name={question.id}
                            checked={value === o}
                            onChange={() => onChange(o)}
                            className="size-4 accent-primary"
                        />
                        <span>{o}</span>
                    </label>
                ))}
            </div>
        )
    }
    // multi_choice
    const opts = question.options ?? []
    const arr = Array.isArray(value) ? value : []
    return (
        <div className="flex flex-col gap-1.5">
            {opts.map((o) => {
                const checked = arr.includes(o)
                return (
                    <label key={o} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                                const next = checked ? arr.filter((x) => x !== o) : [...arr, o]
                                onChange(next)
                            }}
                            className="size-4 accent-primary"
                        />
                        <span>{o}</span>
                    </label>
                )
            })}
        </div>
    )
}

function AnswerDisplay({ question, value, hasResponse }: { question: InterviewQuestion; value: DraftValue; hasResponse: boolean }) {
    if (!hasResponse) {
        return <p className="text-xs text-muted-foreground italic">— awaiting response</p>
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
        return (
            <Badge variant={yes ? 'success' : 'secondary'} className={cn('text-[10px]', !yes && 'text-rose-700 dark:text-rose-300')}>
                {yes ? 'Yes' : 'No'}
            </Badge>
        )
    }
    if ((question.questionType === 'single_choice' || question.questionType === 'multi_choice')) {
        const vals = Array.isArray(value) ? value : value ? [value as string] : []
        if (vals.length === 0) return <p className="text-xs text-muted-foreground italic">— no option selected</p>
        return (
            <div className="flex flex-wrap gap-1">
                {vals.map((v) => (
                    <Badge key={v} variant="secondary" className="text-[10px]">{v}</Badge>
                ))}
            </div>
        )
    }
    const text = typeof value === 'string' ? value.trim() : ''
    return text ? (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{text}</p>
    ) : (
        <p className="text-xs text-muted-foreground italic">— empty response</p>
    )
}

// ─── Codec: DB ⇄ draft ──────────────────────────────────────────────────────

function decodeAnswer(type: QuestionType, r: ExitInterviewResponse): DraftValue {
    if (type === 'rating') {
        if (typeof r.answerValue === 'number') return r.answerValue
        const parsed = Number(r.answerText ?? '')
        return Number.isFinite(parsed) ? parsed : null
    }
    if (type === 'yes_no') {
        const raw = (r.answerValue ?? r.answerText ?? '').toString().toLowerCase()
        return raw === 'yes' || raw === 'true' ? 'yes' : raw === 'no' || raw === 'false' ? 'no' : null
    }
    if (type === 'multi_choice') {
        if (Array.isArray(r.answerValue)) return r.answerValue as string[]
        return []
    }
    if (type === 'single_choice') {
        if (Array.isArray(r.answerValue)) return (r.answerValue[0] as string) ?? null
        if (typeof r.answerValue === 'string') return r.answerValue
        return r.answerText ?? null
    }
    return r.answerText ?? ''
}

function encodeAsText(type: QuestionType, value: DraftValue): string | undefined {
    if (value == null) return undefined
    if (type === 'short_text' || type === 'long_text') {
        return typeof value === 'string' ? value : undefined
    }
    if (type === 'yes_no' || type === 'single_choice') {
        return typeof value === 'string' ? value : undefined
    }
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

function questionTypeLabel(type: QuestionType): string {
    const map: Record<QuestionType, string> = {
        short_text: 'Text',
        long_text: 'Text',
        rating: 'Rating',
        single_choice: 'Choice',
        multi_choice: 'Multi',
        yes_no: 'Yes / No',
    }
    return map[type]
}
