/**
 * MultiEntryField — generic "list with inline-edit" pattern used for
 * Education + Experience on the portal's referral form.
 *
 * Mirrors frontend/src/components/shared/MultiEntryField.tsx — kept as a
 * separate copy because the portal is a different workspace with no path
 * alias to the admin frontend. If either side changes, update both.
 */
import { useCallback, useState, type ReactNode } from 'react'
import { Plus, Pencil, Trash2, Check, X as XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { cn } from '@/lib/utils'

export interface MultiEntryFieldProps<T> {
    label: string
    optional?: boolean
    items: T[]
    onChange: (next: T[]) => void
    newItem: () => T
    renderSummary: (item: T) => ReactNode
    renderForm: (draft: T, onChange: (next: T) => void) => ReactNode
    validate?: (draft: T) => string | null | undefined
    getKey?: (item: T, index: number) => string | number
    className?: string
    addLabel?: string
    editLabel?: string
    deleteLabel?: string
    updateLabel?: string
    cancelLabel?: string
    deleteConfirmTitle?: string
    deleteConfirmDescription?: string
}

type Mode<T> =
    | { kind: 'idle' }
    | { kind: 'adding'; draft: T; error?: string }
    | { kind: 'editing'; index: number; draft: T; error?: string }

export function MultiEntryField<T>({
    label,
    optional,
    items,
    onChange,
    newItem,
    renderSummary,
    renderForm,
    validate,
    getKey,
    className,
    addLabel = '+ Add',
    editLabel = 'Edit',
    deleteLabel = 'Delete',
    updateLabel = 'Update',
    cancelLabel = 'Cancel',
    deleteConfirmTitle = 'Remove entry?',
    deleteConfirmDescription = 'This entry will be removed from the referral.',
}: MultiEntryFieldProps<T>) {
    const [mode, setMode] = useState<Mode<T>>({ kind: 'idle' })
    const [pendingDelete, setPendingDelete] = useState<number | null>(null)

    const startAdd = useCallback(() => setMode({ kind: 'adding', draft: newItem() }), [newItem])
    const startEdit = useCallback((i: number) => setMode({ kind: 'editing', index: i, draft: { ...items[i] } }), [items])
    const cancel = useCallback(() => setMode({ kind: 'idle' }), [])
    const updateDraft = useCallback((next: T) => {
        setMode((m) => (m.kind === 'idle' ? m : { ...m, draft: next, error: undefined }))
    }, [])
    const save = useCallback(() => {
        if (mode.kind === 'idle') return
        const error = validate?.(mode.draft)
        if (error) { setMode({ ...mode, error }); return }
        if (mode.kind === 'adding') onChange([...items, mode.draft])
        else {
            const next = items.slice()
            next[mode.index] = mode.draft
            onChange(next)
        }
        setMode({ kind: 'idle' })
    }, [mode, items, onChange, validate])
    const removeAt = useCallback((i: number) => {
        const next = items.slice()
        next.splice(i, 1)
        onChange(next)
        if (mode.kind === 'editing' && mode.index === i) setMode({ kind: 'idle' })
    }, [items, onChange, mode])
    const isEditingIndex = (i: number) => mode.kind === 'editing' && mode.index === i

    return (
        <div className={cn('space-y-3', className)}>
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">
                    {label}
                    {optional && <span className="ml-1 text-xs font-normal text-muted-foreground">(Optional)</span>}
                </div>
                {mode.kind === 'idle' && (
                    <Button type="button" variant="outline" size="sm" onClick={startAdd} className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-300 dark:border-emerald-900/50 dark:hover:bg-emerald-950/40">
                        <Plus className="size-3.5 ltr:mr-0.5 rtl:ml-0.5" />{addLabel.replace(/^\+\s*/, '')}
                    </Button>
                )}
            </div>

            {items.length > 0 && (
                <ul className="space-y-2">
                    {items.map((item, i) => (
                        <li key={getKey ? getKey(item, i) : i}>
                            {isEditingIndex(i) ? (
                                <InlineFormCard
                                    draft={(mode as Extract<Mode<T>, { kind: 'editing' }>).draft}
                                    error={(mode as Extract<Mode<T>, { kind: 'editing' }>).error}
                                    onChange={updateDraft}
                                    onSave={save}
                                    onCancel={cancel}
                                    renderForm={renderForm}
                                    updateLabel={updateLabel}
                                    cancelLabel={cancelLabel}
                                />
                            ) : (
                                <div className="group rounded-lg border border-border bg-card px-4 py-3">
                                    <div className="flex items-start gap-3">
                                        <div className="min-w-0 flex-1">{renderSummary(item)}</div>
                                        <div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-70 sm:group-hover:opacity-100 transition-opacity">
                                            <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(i)} aria-label={editLabel}>
                                                <Pencil className="size-3.5" />
                                            </Button>
                                            <Button type="button" variant="ghost" size="sm" onClick={() => setPendingDelete(i)} aria-label={deleteLabel} className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                                                <Trash2 className="size-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {mode.kind === 'adding' && (
                <InlineFormCard
                    draft={mode.draft}
                    error={mode.error}
                    onChange={updateDraft}
                    onSave={save}
                    onCancel={cancel}
                    renderForm={renderForm}
                    updateLabel={updateLabel}
                    cancelLabel={cancelLabel}
                />
            )}

            <ConfirmDialog
                open={pendingDelete !== null}
                onOpenChange={(o) => !o && setPendingDelete(null)}
                onConfirm={() => {
                    if (pendingDelete !== null) removeAt(pendingDelete)
                    setPendingDelete(null)
                }}
                title={deleteConfirmTitle}
                description={deleteConfirmDescription}
                confirmLabel={deleteLabel}
                variant="destructive"
            />
        </div>
    )
}

function InlineFormCard<T>({
    draft, error, onChange, onSave, onCancel, renderForm, updateLabel, cancelLabel,
}: {
    draft: T
    error?: string
    onChange: (next: T) => void
    onSave: () => void
    onCancel: () => void
    renderForm: (draft: T, onChange: (next: T) => void) => ReactNode
    updateLabel: string
    cancelLabel: string
}) {
    return (
        <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/30 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/15">
            <div className="space-y-4">{renderForm(draft, onChange)}</div>
            {error && <p className="mt-3 text-xs font-medium text-rose-600 dark:text-rose-300">{error}</p>}
            <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-3">
                <Button type="button" size="sm" onClick={onSave} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                    <Check className="size-3.5 ltr:mr-1 rtl:ml-1" />{updateLabel}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
                    <XIcon className="size-3.5 ltr:mr-1 rtl:ml-1" />{cancelLabel}
                </Button>
            </div>
        </div>
    )
}

// ── Domain types ─────────────────────────────────────────────────────────────

export interface EducationEntry {
    school: string
    degree?: string
    fieldOfStudy?: string
    startDate?: string
    endDate?: string
    current?: boolean
    summary?: string
}

export interface ExperienceEntry {
    title: string
    company?: string
    industry?: string
    summary?: string
    startDate?: string
    endDate?: string
    current?: boolean
}

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say'

export const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'other', label: 'Other' },
    { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

export const emptyEducation = (): EducationEntry => ({ school: '' })
export const emptyExperience = (): ExperienceEntry => ({ title: '' })

export const validateEducation = (e: EducationEntry): string | null =>
    e.school.trim() ? null : 'School is required.'
export const validateExperience = (e: ExperienceEntry): string | null =>
    e.title.trim() ? null : 'Title is required.'

export function educationSummary(e: EducationEntry): ReactNode {
    const parts = [e.school, e.degree, e.fieldOfStudy].filter(Boolean).join(' · ')
    const dates = formatDateRange(e.startDate, e.endDate, e.current)
    return (
        <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{parts || e.school || 'Untitled'}</p>
            {(dates || e.summary) && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {dates}{dates && e.summary ? ' · ' : ''}{e.summary}
                </p>
            )}
        </div>
    )
}

export function experienceSummary(e: ExperienceEntry): ReactNode {
    const top = [e.title, e.company].filter(Boolean).join(' · ')
    const dates = formatDateRange(e.startDate, e.endDate, e.current)
    return (
        <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{top || e.title || 'Untitled'}</p>
            {(dates || e.industry || e.summary) && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {[dates, e.industry, e.summary].filter(Boolean).join(' · ')}
                </p>
            )}
        </div>
    )
}

function formatDateRange(start?: string, end?: string, current?: boolean): string {
    const fmt = (s?: string) => {
        if (!s) return ''
        const [y, m] = s.split('-')
        if (!y) return ''
        if (!m) return y
        const month = new Date(Number(y), Number(m) - 1, 1).toLocaleString('en', { month: 'short' })
        return `${month} ${y}`
    }
    const s = fmt(start)
    const e = current ? 'Present' : fmt(end)
    if (!s && !e) return ''
    if (s && e) return `${s} – ${e}`
    return s || e
}
