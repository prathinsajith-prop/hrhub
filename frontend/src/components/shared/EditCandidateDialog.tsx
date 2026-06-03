import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Label } from '@/components/ui/primitives'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, toast } from '@/components/ui/overlays'
import { useUpdateApplication } from '@/hooks/useRecruitment'
import { PhoneInput, CountrySelect, resolveCountryIso, countryNameFromIso } from '@/components/shared/PhoneInput'
import { CandidateProfileFields } from '@/components/shared/CandidateProfileFields'
import type { EducationEntry, ExperienceEntry, Gender } from '@/components/shared/MultiEntryField'
import type { Candidate } from '@/types'

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
    const [form, setForm] = useState({
        name: '',
        email: '',
        phone: '',
        nationality: '',
        address: '',
        gender: '' as '' | Gender,
        experience: '',
        currentSalary: '',
        expectedSalary: '',
        score: '',
    })
    const [educationHistory, setEducationHistory] = useState<EducationEntry[]>([])
    const [experienceHistory, setExperienceHistory] = useState<ExperienceEntry[]>([])

    // Reset the form whenever a different candidate is loaded into the dialog.
    useEffect(() => {
        if (!candidate) return
        // Helpers: coerce nullable scalars to safe input values.
        // The API may return `null` for optional fields, and `String(null)` is "null"
        // - which would render literally inside the inputs. Treat null/undefined as empty.
        const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
        const num = (v: unknown): string =>
            v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '' : String(v)
        const c = candidate as unknown as {
            address?: string | null
            gender?: Gender | null
            educationHistory?: EducationEntry[] | null
            experienceHistory?: ExperienceEntry[] | null
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setForm({
            name: str(candidate.name),
            email: str(candidate.email),
            phone: str(candidate.phone),
            nationality: str(candidate.nationality),
            address: str(c.address),
            gender: (c.gender ?? '') as '' | Gender,
            experience: num(candidate.experience),
            currentSalary: num(candidate.currentSalary),
            expectedSalary: num(candidate.expectedSalary),
            score: num(candidate.score),
        })
        setEducationHistory(Array.isArray(c.educationHistory) ? c.educationHistory : [])
        setExperienceHistory(Array.isArray(c.experienceHistory) ? c.experienceHistory : [])
    }, [candidate?.id, candidate])

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
            educationHistory,
            experienceHistory,
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Phone</Label>
                            <PhoneInput value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Nationality</Label>
                            <CountrySelect
                                value={resolveCountryIso(form.nationality)}
                                onChange={(iso) => setForm((f) => ({ ...f, nationality: countryNameFromIso(iso) }))}
                                placeholder="Select nationality"
                            />
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

                    {/* Address · Gender · Experience[] · Education[] */}
                    <div className="pt-4 border-t border-border/60">
                        <CandidateProfileFields
                            address={form.address}
                            onAddressChange={(v) => setForm((f) => ({ ...f, address: v }))}
                            gender={form.gender}
                            onGenderChange={(v) => setForm((f) => ({ ...f, gender: v }))}
                            education={educationHistory}
                            onEducationChange={setEducationHistory}
                            experience={experienceHistory}
                            onExperienceChange={setExperienceHistory}
                            compact
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
