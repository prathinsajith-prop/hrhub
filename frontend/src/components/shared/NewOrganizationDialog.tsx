import { useState } from 'react'
import { useCreateTenant, useSwitchTenant } from '@/hooks/useTenants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/overlays'
import { ORG_JURISDICTION_OPTIONS, ORG_INDUSTRY_OPTIONS, ORG_PLAN_OPTIONS } from '@/lib/options'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const INITIAL = {
  name: '',
  jurisdiction: 'Mainland',
  industryType: 'Other',
  subscriptionPlan: 'starter',
}

export function NewOrganizationDialog({ open, onOpenChange, onSuccess }: Props) {
  const createMut = useCreateTenant()
  const switchMut = useSwitchTenant()
  const [form, setForm] = useState(INITIAL)

  const isPending = createMut.isPending || switchMut.isPending

  function set(field: keyof typeof INITIAL, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.name.trim().length < 2) {
      toast.error('Organization name must be at least 2 characters')
      return
    }
    try {
      const result = await createMut.mutateAsync(form)
      setForm(INITIAL)
      onOpenChange(false)
      onSuccess?.()
      // Auto-switch into the new org so the user lands in it immediately
      switchMut.mutate(result.id, {
        onSuccess: () => { window.location.assign('/dashboard') },
        onError: () => toast.error('Organization created but could not switch to it. Use the org switcher.'),
      })
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) ?? 'Failed to create organization')
    }
  }

  function handleOpenChange(v: boolean) {
    if (!isPending) {
      if (!v) setForm(INITIAL)
      onOpenChange(v)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Organization</DialogTitle>
          <DialogDescription>
            You will automatically become the super admin of the new organization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="org-name">Name *</Label>
            <Input
              id="org-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Acme HR LLC"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Jurisdiction</Label>
              <Select value={form.jurisdiction} onValueChange={(v) => set('jurisdiction', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORG_JURISDICTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Industry</Label>
              <Select value={form.industryType} onValueChange={(v) => set('industryType', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORG_INDUSTRY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Plan</Label>
            <Select value={form.subscriptionPlan} onValueChange={(v) => set('subscriptionPlan', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORG_PLAN_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {createMut.isPending ? 'Creating…' : switchMut.isPending ? 'Switching…' : 'Create organization'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
