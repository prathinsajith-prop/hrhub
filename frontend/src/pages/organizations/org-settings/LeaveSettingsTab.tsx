import { useState, useEffect } from 'react'
import { CalendarClock, Save, CheckCircle2, LockKeyhole, UnlockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/overlays'
import { useLeaveSettings, useUpdateLeaveSettings } from '@/hooks/useSettings'
import { Section } from './_shared'

export function LeaveSettingsTab() {
    const { data, isLoading } = useLeaveSettings()
    const updateMut = useUpdateLeaveSettings()
    const [rolloverEnabledFrom, setRolloverEnabledFrom] = useState<string>('')
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        setRolloverEnabledFrom(data?.rolloverEnabledFrom ?? '')
    }, [data])

    const isLocked = (() => {
        if (!data?.rolloverEnabledFrom) return false
        const unlock = new Date(data.rolloverEnabledFrom)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return today < unlock
    })()

    const handleSave = async () => {
        try {
            await updateMut.mutateAsync({
                rolloverEnabledFrom: rolloverEnabledFrom || null,
            })
            setSaved(true)
            toast.success('Leave settings saved', 'Year-end rollover gate updated.')
            setTimeout(() => setSaved(false), 2000)
        } catch {
            toast.error('Save failed', 'Could not update leave settings.')
        }
    }

    const handleClear = async () => {
        try {
            setRolloverEnabledFrom('')
            await updateMut.mutateAsync({ rolloverEnabledFrom: null })
            toast.success('Gate removed', 'Year-end rollover is now always available.')
        } catch {
            toast.error('Save failed', 'Could not update leave settings.')
        }
    }

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-36 w-full" />
            </div>
        )
    }

    return (
        <div className="space-y-5">
            <Section
                icon={CalendarClock}
                title="Year-End Rollover Gate"
                description="Prevent HR from running the annual leave rollover before a set date. Leave blank to allow rollover at any time."
                action={
                    isLocked ? (
                        <Badge variant="destructive" className="gap-1.5">
                            <LockKeyhole className="h-3 w-3" />
                            Locked until {data?.rolloverEnabledFrom}
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="gap-1.5 text-emerald-700 bg-emerald-50 border-emerald-200">
                            <UnlockKeyhole className="h-3 w-3" />
                            {data?.rolloverEnabledFrom ? `Unlocked since ${data.rolloverEnabledFrom}` : 'No gate set'}
                        </Badge>
                    )
                }
            >
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="rolloverDate">Rollover enabled from</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                id="rolloverDate"
                                type="date"
                                value={rolloverEnabledFrom}
                                onChange={(e) => setRolloverEnabledFrom(e.target.value)}
                                className="max-w-xs"
                            />
                            {rolloverEnabledFrom && (
                                <Button variant="ghost" size="sm" onClick={handleClear} disabled={updateMut.isPending}>
                                    Clear gate
                                </Button>
                            )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            HR cannot trigger the year-end rollover before this date. Set to the first day of the new year
                            (e.g. <span className="font-mono">2026-01-01</span>) to prevent premature rollovers.
                        </p>
                    </div>
                </div>
            </Section>

            <div className="flex justify-end pt-2">
                <Button
                    onClick={handleSave}
                    loading={updateMut.isPending}
                    leftIcon={saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                    variant={saved ? 'success' : 'default'}
                >
                    {saved ? 'Saved!' : 'Save Changes'}
                </Button>
            </div>
        </div>
    )
}
