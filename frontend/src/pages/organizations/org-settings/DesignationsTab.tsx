import { useState } from 'react'
import { Plus, Pencil, Check, XCircle, Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast, ConfirmDialog } from '@/components/ui/overlays'
import { useDesignations, useCreateDesignation, useUpdateDesignation } from '@/hooks/useDesignations'
import type { Designation } from '@/hooks/useDesignations'
import { Section } from './_shared'

export function DesignationsTab() {
    const { data: items = [], isLoading } = useDesignations()
    const designations = Array.isArray(items) ? items as Designation[] : []
    const create = useCreateDesignation()
    const update = useUpdateDesignation()

    const [newName, setNewName] = useState('')
    const [addingNew, setAddingNew] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [toggleTarget, setToggleTarget] = useState<Designation | null>(null)

    function handleAdd() {
        const name = newName.trim()
        if (!name) return
        create.mutate({ name }, {
            onSuccess: () => { setNewName(''); setAddingNew(false); toast.success('Designation added') },
            onError: (err: Error) => toast.error(err.message.includes('unique') ? 'Designation already exists' : 'Failed to add'),
        })
    }

    function handleUpdate(id: string) {
        const name = editName.trim()
        if (!name) return
        update.mutate({ id, data: { name } }, {
            onSuccess: () => { setEditingId(null); toast.success('Updated') },
            onError: (err: Error) => toast.error(err.message.includes('unique') ? 'Name already exists' : 'Failed to update'),
        })
    }

    function handleToggle() {
        if (!toggleTarget) return
        update.mutate({ id: toggleTarget.id, data: { isActive: !toggleTarget.isActive } }, {
            onSuccess: () => { toast.success(toggleTarget.isActive ? `"${toggleTarget.name}" deactivated` : `"${toggleTarget.name}" activated`); setToggleTarget(null) },
            onError: () => { toast.error('Failed to update'); setToggleTarget(null) },
        })
    }

    return (
        <>
        <div className="space-y-6">
            <div>
                <h3 className="text-base font-semibold">Designations</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Define job titles that can be assigned to employees. These appear as a dropdown when adding or editing employees.
                </p>
            </div>

            <Section icon={Briefcase} title="Job Titles" description="Add, rename, activate or deactivate designations used across the organization.">
                <div className="space-y-2">
                    {isLoading ? (
                        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" />)}</div>
                    ) : designations.length === 0 && !addingNew ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No designations yet. Add one to get started.</p>
                    ) : (
                        <div className="divide-y divide-border/50 rounded-lg border bg-background">
                            {designations.map(d => (
                                <div key={d.id} className="flex items-center gap-2 px-3 py-2.5">
                                    {editingId === d.id ? (
                                        <>
                                            <Input
                                                autoFocus
                                                className="flex-1 h-8"
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleUpdate(d.id)
                                                    if (e.key === 'Escape') setEditingId(null)
                                                }}
                                            />
                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700" onClick={() => handleUpdate(d.id)}>
                                                <Check className="h-4 w-4" />
                                            </Button>
                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => setEditingId(null)}>
                                                <XCircle className="h-4 w-4" />
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <span className={cn('flex-1 text-sm font-medium', !d.isActive && 'line-through text-muted-foreground')}>{d.name}</span>
                                            {!d.isActive && (
                                                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium shrink-0">Inactive</span>
                                            )}
                                            <Button
                                                size="sm" variant="ghost"
                                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                                title="Rename"
                                                onClick={() => { setEditingId(d.id); setEditName(d.name) }}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                size="sm" variant="outline"
                                                className={cn('text-xs h-6 px-2 rounded-full font-medium', d.isActive
                                                    ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                                    : 'border-muted-foreground/30 text-muted-foreground hover:bg-muted')}
                                                title={d.isActive ? 'Deactivate' : 'Activate'}
                                                onClick={() => setToggleTarget(d)}
                                            >
                                                {d.isActive ? 'Active' : 'Inactive'}
                                            </Button>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {addingNew ? (
                        <div className="flex items-center gap-2 mt-2">
                            <Input
                                autoFocus
                                className="flex-1"
                                placeholder="e.g. Senior Engineer"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleAdd()
                                    if (e.key === 'Escape') { setAddingNew(false); setNewName('') }
                                }}
                            />
                            <Button size="sm" onClick={handleAdd} disabled={!newName.trim() || create.isPending}>
                                {create.isPending ? '…' : 'Add'}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground" onClick={() => { setAddingNew(false); setNewName('') }}>
                                <XCircle className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <Button variant="ghost" size="sm" className="gap-1.5 text-primary font-medium mt-1" onClick={() => setAddingNew(true)}>
                            <Plus className="h-3.5 w-3.5" /> Add designation
                        </Button>
                    )}
                </div>
            </Section>
        </div>

        <ConfirmDialog
            open={!!toggleTarget}
            onOpenChange={o => !o && setToggleTarget(null)}
            title={toggleTarget?.isActive ? `Deactivate "${toggleTarget?.name}"?` : `Activate "${toggleTarget?.name}"?`}
            description={toggleTarget?.isActive
                ? 'This designation will be hidden from employee forms. Employees currently assigned this title are not affected.'
                : 'This designation will become available again in employee forms.'}
            confirmLabel={toggleTarget?.isActive ? 'Deactivate' : 'Activate'}
            variant={toggleTarget?.isActive ? 'destructive' : 'success'}
            onConfirm={handleToggle}
        />

</>
    )
}
