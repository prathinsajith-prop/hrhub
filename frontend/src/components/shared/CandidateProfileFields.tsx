/**
 * CandidateProfileFields — drop-in block that renders the four new candidate
 * fields (Address, Gender, Education[], Experience[]) on any candidate form.
 *
 * Used by:
 *   • Public CareersJobPage apply form
 *   • Admin AddCandidateDialog
 *   • Admin EditCandidateDialog
 *
 * State is fully controlled — caller owns address/gender/education/experience
 * and passes setters. This keeps the host form's "is dirty / submit payload"
 * tracking in one place.
 */
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
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
    /** Compact mode pulls in tighter spacing and skips the section divider.
     *  Used in dialogs where vertical room is limited. */
    compact?: boolean
    /** When false, Gender is omitted and Address spans full width (the host form
     *  renders Gender itself, e.g. beside Email). Defaults to true. */
    showGender?: boolean
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
            {/* Address — full width; Gender alongside only when the host form
                isn't placing it elsewhere (e.g. beside Email). */}
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

            {/* Experience — multi-entry */}
            <MultiEntryField<ExperienceEntry>
                label="Experience"
                optional
                items={experience}
                onChange={onExperienceChange}
                newItem={emptyExperience}
                validate={validateExperience}
                renderSummary={experienceSummary}
                renderForm={(draft, onChange) => (
                    <ExperienceForm draft={draft} onChange={onChange} />
                )}
            />

            {/* Education — multi-entry */}
            <MultiEntryField<EducationEntry>
                label="Education"
                optional
                items={education}
                onChange={onEducationChange}
                newItem={emptyEducation}
                validate={validateEducation}
                renderSummary={educationSummary}
                renderForm={(draft, onChange) => (
                    <EducationForm draft={draft} onChange={onChange} />
                )}
            />
        </div>
    )
}

/** Standalone Gender select — reusable so a host form can place it next to its
 *  own fields (e.g. beside Email) instead of inside CandidateProfileFields. */
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

// ── Inline edit forms ────────────────────────────────────────────────────────
// Both forms follow the same shape: required title → optional details → dates
// with a "currently here" checkbox that disables the End-date input.

function ExperienceForm({ draft, onChange }: { draft: ExperienceEntry; onChange: (next: ExperienceEntry) => void }) {
    const patch = (p: Partial<ExperienceEntry>) => onChange({ ...draft, ...p })
    return (
        <>
            <FieldShell label="Title" required>
                <Input
                    value={draft.title}
                    onChange={(e) => patch({ title: e.target.value })}
                    placeholder="Job title"
                    autoFocus
                />
            </FieldShell>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldShell label="Company" optional>
                    <Input value={draft.company ?? ''} onChange={(e) => patch({ company: e.target.value })} placeholder="Company name" />
                </FieldShell>
                <FieldShell label="Industry" optional>
                    <Input value={draft.industry ?? ''} onChange={(e) => patch({ industry: e.target.value })} placeholder="Industry" />
                </FieldShell>
            </div>
            <FieldShell label="Summary" optional>
                <Textarea
                    rows={3}
                    value={draft.summary ?? ''}
                    onChange={(e) => patch({ summary: e.target.value })}
                    placeholder="What you did, the team size, key technologies, outcomes…"
                    className="resize-none"
                />
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
                <Input
                    value={draft.school}
                    onChange={(e) => patch({ school: e.target.value })}
                    placeholder="School or university"
                    autoFocus
                />
            </FieldShell>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldShell label="Degree" optional>
                    <Input value={draft.degree ?? ''} onChange={(e) => patch({ degree: e.target.value })} placeholder="Degree" />
                </FieldShell>
                <FieldShell label="Field of study" optional>
                    <Input value={draft.fieldOfStudy ?? ''} onChange={(e) => patch({ fieldOfStudy: e.target.value })} placeholder="Field of study" />
                </FieldShell>
            </div>
            <FieldShell label="Summary" optional>
                <Textarea
                    rows={3}
                    value={draft.summary ?? ''}
                    onChange={(e) => patch({ summary: e.target.value })}
                    placeholder="Honours, GPA, key coursework, activities…"
                    className="resize-none"
                />
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
                    {/* YYYY-MM input — native browser MM/YYYY picker. */}
                    <Input type="month" value={start} onChange={(e) => onStart(e.target.value)} placeholder="MM/YYYY" />
                </FieldShell>
                <FieldShell label="End date" optional>
                    <Input type="month" value={end} onChange={(e) => onEnd(e.target.value)} placeholder="MM/YYYY" disabled={current} />
                </FieldShell>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
                <Checkbox checked={current} onCheckedChange={(v) => onCurrent(!!v)} />
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
