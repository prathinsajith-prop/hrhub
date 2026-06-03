/**
 * CandidateProfileFields (portal) — Address, Gender, Education[], Experience[]
 * for the employee referral form. Mirrors the admin frontend version.
 *
 * State is fully controlled — caller owns the data and passes setters so it
 * can package the submit payload (multipart in the referral case).
 */
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import {
    MultiEntryField,
    type EducationEntry,
    type ExperienceEntry,
    type Gender,
    GENDER_OPTIONS,
    emptyEducation,
    emptyExperience,
    validateEducation,
    validateExperience,
    educationSummary,
    experienceSummary,
} from './MultiEntryField'

export interface CandidateProfileFieldsProps {
    address: string
    onAddressChange: (v: string) => void
    gender: Gender | ''
    onGenderChange: (v: Gender | '') => void
    education: EducationEntry[]
    onEducationChange: (v: EducationEntry[]) => void
    experience: ExperienceEntry[]
    onExperienceChange: (v: ExperienceEntry[]) => void
    compact?: boolean
    /** When false, Gender is omitted and Address spans full width (host renders
     *  Gender itself, e.g. beside Nationality). Defaults to true. */
    showGender?: boolean
}

/** Standalone Gender select so a host form can place it in a top position. */
export function GenderSelect({ value, onChange }: { value: Gender | ''; onChange: (v: Gender | '') => void }) {
    return (
        <Select value={value || ''} onValueChange={(v) => onChange(v as Gender)}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
                {GENDER_OPTIONS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

export function CandidateProfileFields({
    address, onAddressChange,
    gender, onGenderChange,
    education, onEducationChange,
    experience, onExperienceChange,
    compact = false,
    showGender = true,
}: CandidateProfileFieldsProps) {
    return (
        <div className={compact ? 'space-y-4' : 'space-y-5'}>
            {showGender ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FieldShell label="Address" optional>
                        <Textarea rows={2} value={address} onChange={(e) => onAddressChange(e.target.value)} placeholder="Street, city, country" className="resize-none" />
                    </FieldShell>
                    <FieldShell label="Gender" optional>
                        <GenderSelect value={gender} onChange={onGenderChange} />
                    </FieldShell>
                </div>
            ) : (
                <FieldShell label="Address" optional>
                    <Textarea rows={2} value={address} onChange={(e) => onAddressChange(e.target.value)} placeholder="Street, city, country" className="resize-none" />
                </FieldShell>
            )}

            <MultiEntryField<ExperienceEntry>
                label="Experience"
                optional
                items={experience}
                onChange={onExperienceChange}
                newItem={emptyExperience}
                validate={validateExperience}
                renderSummary={experienceSummary}
                renderForm={(draft, onChange) => <ExperienceForm draft={draft} onChange={onChange} />}
            />

            <MultiEntryField<EducationEntry>
                label="Education"
                optional
                items={education}
                onChange={onEducationChange}
                newItem={emptyEducation}
                validate={validateEducation}
                renderSummary={educationSummary}
                renderForm={(draft, onChange) => <EducationForm draft={draft} onChange={onChange} />}
            />
        </div>
    )
}

// ── Inline edit forms ────────────────────────────────────────────────────────

function ExperienceForm({ draft, onChange }: { draft: ExperienceEntry; onChange: (next: ExperienceEntry) => void }) {
    const patch = (p: Partial<ExperienceEntry>) => onChange({ ...draft, ...p })
    return (
        <>
            <FieldShell label="Title" required>
                <Input value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="e.g. Senior Frontend Engineer" autoFocus />
            </FieldShell>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldShell label="Company" optional>
                    <Input value={draft.company ?? ''} onChange={(e) => patch({ company: e.target.value })} placeholder="e.g. Acme Corp" />
                </FieldShell>
                <FieldShell label="Industry" optional>
                    <Input value={draft.industry ?? ''} onChange={(e) => patch({ industry: e.target.value })} placeholder="e.g. Fintech" />
                </FieldShell>
            </div>
            <FieldShell label="Summary" optional>
                <Textarea rows={3} value={draft.summary ?? ''} onChange={(e) => patch({ summary: e.target.value })} placeholder="What you did, the team size, key technologies, outcomes…" className="resize-none" />
            </FieldShell>
            <DateRangeFields
                start={draft.startDate ?? ''}
                end={draft.endDate ?? ''}
                current={!!draft.current}
                onStart={(v) => patch({ startDate: v })}
                onEnd={(v) => patch({ endDate: v })}
                onCurrent={(v) => patch({ current: v, endDate: v ? '' : draft.endDate })}
                currentLabel="I currently work here"
            />
        </>
    )
}

function EducationForm({ draft, onChange }: { draft: EducationEntry; onChange: (next: EducationEntry) => void }) {
    const patch = (p: Partial<EducationEntry>) => onChange({ ...draft, ...p })
    return (
        <>
            <FieldShell label="School" required>
                <Input value={draft.school} onChange={(e) => patch({ school: e.target.value })} placeholder="e.g. American University of Sharjah" autoFocus />
            </FieldShell>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldShell label="Degree" optional>
                    <Input value={draft.degree ?? ''} onChange={(e) => patch({ degree: e.target.value })} placeholder="e.g. Bachelor's" />
                </FieldShell>
                <FieldShell label="Field of study" optional>
                    <Input value={draft.fieldOfStudy ?? ''} onChange={(e) => patch({ fieldOfStudy: e.target.value })} placeholder="e.g. Computer Science" />
                </FieldShell>
            </div>
            <FieldShell label="Summary" optional>
                <Textarea rows={3} value={draft.summary ?? ''} onChange={(e) => patch({ summary: e.target.value })} placeholder="Honours, GPA, key coursework, activities…" className="resize-none" />
            </FieldShell>
            <DateRangeFields
                start={draft.startDate ?? ''}
                end={draft.endDate ?? ''}
                current={!!draft.current}
                onStart={(v) => patch({ startDate: v })}
                onEnd={(v) => patch({ endDate: v })}
                onCurrent={(v) => patch({ current: v, endDate: v ? '' : draft.endDate })}
                currentLabel="I currently study here"
            />
        </>
    )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function DateRangeFields({
    start, end, current, onStart, onEnd, onCurrent, currentLabel,
}: {
    start: string
    end: string
    current: boolean
    onStart: (v: string) => void
    onEnd: (v: string) => void
    onCurrent: (v: boolean) => void
    currentLabel: string
}) {
    return (
        <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldShell label="Start date" optional>
                    <Input type="month" value={start} onChange={(e) => onStart(e.target.value)} placeholder="MM/YYYY" />
                </FieldShell>
                <FieldShell label="End date" optional>
                    <Input type="month" value={end} onChange={(e) => onEnd(e.target.value)} placeholder="MM/YYYY" disabled={current} />
                </FieldShell>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-foreground/80 cursor-pointer select-none">
                {/* Native checkbox to avoid adding a new shadcn primitive to the portal */}
                <input
                    type="checkbox"
                    checked={current}
                    onChange={(e) => onCurrent(e.target.checked)}
                    className="size-4 rounded border-border accent-emerald-600"
                />
                {currentLabel}
            </label>
        </>
    )
}

function FieldShell({ label, required, optional, children }: { label: string; required?: boolean; optional?: boolean; children: ReactNode }) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs font-medium">
                {required && <span className="text-destructive">* </span>}
                {label}
                {optional && <span className="ml-1 text-[11px] font-normal text-muted-foreground">(Optional)</span>}
            </Label>
            {children}
        </div>
    )
}
