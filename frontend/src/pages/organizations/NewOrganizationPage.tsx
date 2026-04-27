import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateTenant } from '@/hooks/useTenants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { toast } from '@/components/ui/overlays'

export function NewOrganizationPage() {
    const navigate = useNavigate()
    const createMut = useCreateTenant()
    const [form, setForm] = useState({
        name: '',
        jurisdiction: 'Mainland',
        industryType: 'Other',
        subscriptionPlan: 'free',
    })

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (form.name.trim().length < 2) {
            toast.error('Organization name is required')
            return
        }
        try {
            await createMut.mutateAsync(form)
            toast.success('Organization created')
            navigate('/organizations')
        } catch (err: unknown) {
            toast.error((err instanceof Error ? err.message : null) ?? 'Failed to create organization')
        }
    }

    return (
        <PageWrapper>
            <PageHeader
                title="New Organization"
                description="Create a new tenant. You will become its super admin automatically."
            />

            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle className="text-base">Organization details</CardTitle>
                    <CardDescription>You can change these later in Settings.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={onSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="name">Name *</Label>
                            <Input
                                id="name"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="Acme HR LLC"
                                required
                            />
                        </div>

                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label>Jurisdiction</Label>
                                <Select value={form.jurisdiction} onValueChange={(v) => setForm({ ...form, jurisdiction: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Mainland">Mainland</SelectItem>
                                        <SelectItem value="Free Zone">Free Zone</SelectItem>
                                        <SelectItem value="Offshore">Offshore</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label>Industry</Label>
                                <Select value={form.industryType} onValueChange={(v) => setForm({ ...form, industryType: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Technology">Technology</SelectItem>
                                        <SelectItem value="Construction">Construction</SelectItem>
                                        <SelectItem value="Hospitality">Hospitality</SelectItem>
                                        <SelectItem value="Retail">Retail</SelectItem>
                                        <SelectItem value="Healthcare">Healthcare</SelectItem>
                                        <SelectItem value="Other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label>Subscription plan</Label>
                            <Select value={form.subscriptionPlan} onValueChange={(v) => setForm({ ...form, subscriptionPlan: v })}>
                                <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="free">Free</SelectItem>
                                    <SelectItem value="starter">Starter</SelectItem>
                                    <SelectItem value="pro">Pro</SelectItem>
                                    <SelectItem value="enterprise">Enterprise</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <Button type="submit" disabled={createMut.isPending}>
                                {createMut.isPending ? 'Creating…' : 'Create organization'}
                            </Button>
                            <Button type="button" variant="ghost" onClick={() => navigate('/organizations')}>
                                Cancel
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </PageWrapper>
    )
}
