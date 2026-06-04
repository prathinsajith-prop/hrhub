import { useState } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/primitives'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, toast } from '@/components/ui/overlays'
import { useUpdateApplication, useJobTagSuggestions } from '@/hooks/useRecruitment'
import { PhoneInput, CountrySelect, resolveCountryIso, countryNameFromIso } from '@/components/shared/PhoneInput'
import { CandidateProfileFields, GenderSelect } from '@/components/shared/CandidateProfileFields'
import { ChipsField } from '@/components/shared/ChipsField'
import type { EducationEntry, ExperienceEntry, Gender } from '@/components/shared/MultiEntryField'
import type { Candidate } from '@/types'

// Coerce nullable scalars to safe input values. The API may return `null` for
// optional fields, and `String(null)` is "null" — which would render literally
// inside the inputs. Treat null/undefined as empty. Module scope: pure + stable.
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
const num = (v: unknown): string =>
    v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '' : String(v)

/** Initial form values for a candidate (or blanks when none). */
function buildForm(c: Candidate | null) {
    return {
        name: str(c?.name),
        email: str(c?.email),
        phone: str(c?.phone),
        nationality: str(c?.nationality),
        address: str(c?.address),
        gender: (c?.gender ?? '') as '' | Gender,
        experience: num(c?.experience),
        currentSalary: num(c?.currentSalary),
        expectedSalary: num(c?.expectedSalary),
        score: num(c?.score),
        notes: str(c?.notes),
    }
}

/**
 * Shared dialog for editing the editable fields of a candidate (job application).
 * Used from the kanban card and the candidate profile page so both surfaces
 * share the same validation and persistence logic.
 */
export function EditCandidateDialog({
    candidate,
    open,
    onOpenChange,
    onSaved,
}: {
    candidate: Candidate | null
    open: boolean
    onOpenChange: (o: boolean) => void
    onSaved?: () => void
}) {
    const updateApplication = useUpdateApplication()
    const [form, setForm] = useState(() => buildForm(candidate))
    const [educationHistory, setEducationHistory] = useState<EducationEntry[]>(() => Array.isArray(candidate?.educationHistory) ? candidate.educationHistory : [])
    const [experienceHistory, setExperienceHistory] = useState<ExperienceEntry[]>(() => Array.isArray(candidate?.experienceHistory) ? candidate.experienceHistory : [])
    const [skills, setSkills] = useState<string[]>(() => Array.isArray(candidate?.skills) ? candidate.skills : [])
    const [skillInput, setSkillInput] = useState('')
    // Track which candidate the form currently mirrors, so we can re-seed it
    // when a DIFFERENT candidate is loaded into an already-open dialog.
    const [syncedId, setSyncedId] = useState<string | null>(candidate?.id ?? null)
    const { data: tagSuggestions } = useJobTagSuggestions()
    const addSkill = (value?: string) => {
        const v = (value ?? skillInput).trim()
        if (v && !skills.some(s => s.toLowerCase() === v.toLowerCase())) setSkills(s => [...s, v])
        setSkillInput('')
    }

    // Re-seed the form when a different candidate arrives — synced DURING render
    // (the project's preferred pattern, per CLAUDE.md) rather than in a post-render
    // useEffect, so users never see a frame of the previous candidate's values.
    // Guarded by id, so it never clobbers the user's in-progress edits.
    if (candidate && candidate.id !== syncedId) {
        setSyncedId(candidate.id)
        setForm(buildForm(candidate))
        setEducationHistory(Array.isArray(candidate.educationHistory) ? candidate.educationHistory : [])
        setExperienceHistory(Array.isArray(candidate.experienceHistory) ? candidate.experienceHistory : [])
        setSkills(Array.isArray(candidate.skills) ? candidate.skills : [])
        setSkillInput('')
    }

    if (!candidate) return null

    const handleSave = () => {
        const trimmedName = form.name.trim()
        const trimmedEmail = form.email.trim()
        if (!trimmedName)  { toast.error('Name required', 'Enter the candidate name.'); return }
        if (!trimmedEmail) { toast.error('Email required', 'Enter the candidate email.'); return }
        const payload: Record<string, unknown> = {
            name: trimmedName,
            email: trimmedEmail,
            phone: form.phone.trim(),
            nationality: form.nationality.trim(),
            address: form.address.trim(),
            // Send gender only when set — empty string would fail enum validation.
            ...(form.gender ? { gender: form.gender } : {}),
            skills,
            educationHistory,
            experienceHistory,
            notes: form.notes.trim(),
        }
        if (form.experience !== '') payload.experience = Number(form.experience)
        if (form.currentSalary !== '') payload.currentSalary = Number(form.currentSalary)
        if (form.expectedSalary !== '') payload.expectedSalary = Number(form.expectedSalary)
        if (form.score !== '') {
            const scoreNum = Number(form.score)
            if (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
                toast.error('Invalid score', 'Score must be a number between 0 and 100.')
                return
            }
            payload.score = scoreNum
        }

        updateApplication.mutate(
            { id: candidate.id, data: payload },
            {
                onSuccess: () => {
                    toast.success('Candidate updated')
                    onOpenChange(false)
                    onSaved?.()
                },
                onError: (err: unknown) => {
                    const msg = err instanceof Error ? err.message : 'Could not save changes.'
                    toast.error('Update failed', msg)
                },
            },
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="lg">
                <DialogHeader>
                    <DialogTitle>Edit Candidate</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label required>Name</Label>
                            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label required>Email</Label>
                            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Phone</Label>
                        <PhoneInput value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Nationality</Label>
                            <CountrySelect
                                value={resolveCountryIso(form.nationality)}
                                onChange={(iso) => setForm((f) => ({ ...f, nationality: countryNameFromIso(iso) }))}
                                placeholder="Select nationality"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Gender <span className="ml-1 text-[11px] font-normal text-muted-foreground">(Optional)</span></Label>
                            <GenderSelect value={form.gender} onChange={(v) => setForm((f) => ({ ...f, gender: v }))} />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Experience (years)</Label>
                            <NumericInput value={form.experience} onChange={(e) => setForm((f) => ({ ...f, experience: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Score (0-100)</Label>
                            <NumericInput value={form.score} onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))} />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Current Salary (AED)</Label>
                            <NumericInput value={form.currentSalary} onChange={(e) => setForm((f) => ({ ...f, currentSalary: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Expected Salary (AED)</Label>
                            <NumericInput value={form.expectedSalary} onChange={(e) => setForm((f) => ({ ...f, expectedSalary: e.target.value }))} />
                        </div>
                    </div>

                    {/* Address (full width) · Experience[] · Education[].
                        Gender is rendered above beside Nationality, so we pass
                        showGender={false} to let Address span the full row. */}
                    <div className="pt-4 border-t border-border/60">
                        <CandidateProfileFields
                            address={form.address}
                            onAddressChange={(v) => setForm((f) => ({ ...f, address: v }))}
                            gender={form.gender}
                            onGenderChange={(v) => setForm((f) => ({ ...f, gender: v }))}
                            showGender={false}
                            education={educationHistory}
                            onEducationChange={setEducationHistory}
                            experience={experienceHistory}
                            onExperienceChange={setExperienceHistory}
                            compact
                        />
                        <div className="pt-4">
                            <ChipsField
                                label="Skills"
                                optional
                                chips={skills}
                                onRemove={(v) => setSkills(prev => prev.filter(x => x !== v))}
                                inputValue={skillInput}
                                onInputChange={setSkillInput}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } if (e.key === 'Backspace' && !skillInput && skills.length > 0) setSkills(s => s.slice(0, -1)) }}
                                onAdd={addSkill}
                                onAddValue={addSkill}
                                suggestions={tagSuggestions?.skills}
                                placeholder="Add a skill · Press Enter"
                                chipClassName="bg-sky-100 text-sky-700"
                            />
                        </div>
                    </div>

                    {/* Notes — recruiter remarks, source notes, parsed résumé extras */}
                    <div className="space-y-1.5 pt-4 border-t border-border/60">
                        <Label>Notes</Label>
                        <Textarea
                            value={form.notes}
                            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                            rows={4}
                            placeholder="Recruiter notes"
                        />
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={updateApplication.isPending}>Cancel</Button>
                    <Button onClick={handleSave} loading={updateApplication.isPending} leftIcon={<Save className="size-3.5" />}>
                        Save changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
