import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Label } from '@/components/ui/primitives'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, toast } from '@/components/ui/overlays'
import { useUpdateApplication } from '@/hooks/useRecruitment'
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
        experience: '',
        currentSalary: '',
        expectedSalary: '',
        score: '',
    })

    // Reset the form whenever a different candidate is loaded into the dialog.
    useEffect(() => {
        if (!candidate) return
        // Helpers: coerce nullable scalars to safe input values.
        // The API may return `null` for optional fields, and `String(null)` is "null"
        // — which would render literally inside the inputs. Treat null/undefined as empty.
        const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
        const num = (v: unknown): string =>
            v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '' : String(v)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setForm({
            name: str(candidate.name),
            email: str(candidate.email),
            phone: str(candidate.phone),
            nationality: str(candidate.nationality),
            experience: num(candidate.experience),
            currentSalary: num(candidate.currentSalary),
            expectedSalary: num(candidate.expectedSalary),
            score: num(candidate.score),
        })
    }, [candidate?.id, candidate])

    if (!candidate) return null

    const handleSave = () => {
        const trimmedName = form.name.trim()
        const trimmedEmail = form.email.trim()
        if (!trimmedName) {
            toast.error('Name required')
            return
        }
        if (!trimmedEmail) {
            toast.error('Email required')
            return
        }
        const payload: Record<string, unknown> = {
            name: trimmedName,
            email: trimmedEmail,
            phone: form.phone.trim(),
            nationality: form.nationality.trim(),
        }
        if (form.experience !== '') payload.experience = Number(form.experience)
        if (form.currentSalary !== '') payload.currentSalary = Number(form.currentSalary)
        if (form.expectedSalary !== '') payload.expectedSalary = Number(form.expectedSalary)
        if (form.score !== '') {
            const scoreNum = Number(form.score)
            if (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
                toast.error('Score must be between 0 and 100')
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
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>Edit Candidate</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label required>Name</Label>
                            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label required>Email</Label>
                            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Phone</Label>
                            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Nationality</Label>
                            <Input value={form.nationality} onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Experience (years)</Label>
                            <NumericInput value={form.experience} onChange={(e) => setForm((f) => ({ ...f, experience: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Score (0-100)</Label>
                            <NumericInput value={form.score} onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Current Salary (AED)</Label>
                            <NumericInput value={form.currentSalary} onChange={(e) => setForm((f) => ({ ...f, currentSalary: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Expected Salary (AED)</Label>
                            <NumericInput value={form.expectedSalary} onChange={(e) => setForm((f) => ({ ...f, expectedSalary: e.target.value }))} />
                        </div>
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={updateApplication.isPending}>Cancel</Button>
                    <Button onClick={handleSave} loading={updateApplication.isPending} leftIcon={<Save className="h-3.5 w-3.5" />}>
                        Save changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
