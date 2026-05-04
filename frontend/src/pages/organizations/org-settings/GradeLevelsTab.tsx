import { useState } from 'react'
import { Plus, Pencil, Check, XCircle, GraduationCap, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast, ConfirmDialog } from '@/components/ui/overlays'
import { useGradeLevels, useCreateGradeLevel, useUpdateGradeLevel, type GradeLevel } from '@/hooks/useGradeLevels'
import { useSponsoringEntities, useCreateSponsoringEntity, useUpdateSponsoringEntity, type SponsoringEntity } from '@/hooks/useSponsoringEntities'
import { Section } from './_shared'

// ─── Shared inline-editable list component ────────────────────────────────────

interface MasterItem { id: string; name: string; isActive: boolean }

interface MasterListProps {
    items: MasterItem[]
    isLoading: boolean
    addingNew: boolean
    newName: string
    editingId: string | null
    editName: string
    addPending: boolean
    onNewNameChange: (v: string) => void
    onStartAdd: () => void
    onCancelAdd: () => void
    onAdd: () => void
    onStartEdit: (item: MasterItem) => void
    onEditNameChange: (v: string) => void
    onCancelEdit: () => void
    onSaveEdit: (id: string) => void
    onToggle: (item: MasterItem) => void
    addLabel: string
    emptyMessage: string
}

function MasterList({
    items, isLoading, addingNew, newName, editingId, editName, addPending,
    onNewNameChange, onStartAdd, onCancelAdd, onAdd,
    onStartEdit, onEditNameChange, onCancelEdit, onSaveEdit,
    onToggle, addLabel, emptyMessage,
}: MasterListProps) {
    return (
        <div className="space-y-3">
            {isLoading ? (
                <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
                </div>
            ) : (
                <div className="rounded-xl border bg-card overflow-hidden">
                    {items.length === 0 && !addingNew ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground gap-2">
                            <p>{emptyMessage}</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/40">
                                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-24">Status</th>
                                    <th className="w-24 px-4 py-2.5" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {items.map(item => (
                                    <tr key={item.id} className="group hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-2.5">
                                            {editingId === item.id ? (
                                                <Input
                                                    autoFocus
                                                    className="h-8 max-w-xs"
                                                    value={editName}
                                                    onChange={e => onEditNameChange(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') onSaveEdit(item.id)
                                                        if (e.key === 'Escape') onCancelEdit()
                                                    }}
                                                />
                                            ) : (
                                                <span className={cn('font-medium', !item.isActive && 'line-through text-muted-foreground')}>
                                                    {item.name}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {editingId !== item.id && (
                                                <Badge variant={item.isActive ? 'success' : 'secondary'} className="text-[11px]">
                                                    {item.isActive ? 'Active' : 'Inactive'}
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center justify-end gap-1">
                                                {editingId === item.id ? (
                                                    <>
                                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700" onClick={() => onSaveEdit(item.id)}>
                                                            <Check className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={onCancelEdit}>
                                                            <XCircle className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Button
                                                            size="sm" variant="ghost"
                                                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                                                            title="Rename"
                                                            onClick={() => onStartEdit(item)}
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            size="sm" variant="ghost"
                                                            className={cn('h-7 px-2.5 text-[11px] font-medium rounded-full opacity-0 group-hover:opacity-100 transition-opacity',
                                                                item.isActive
                                                                    ? 'text-amber-600 hover:bg-amber-50 hover:text-amber-700'
                                                                    : 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'
                                                            )}
                                                            onClick={() => onToggle(item)}
                                                        >
                                                            {item.isActive ? 'Deactivate' : 'Activate'}
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {addingNew ? (
                <div className="flex items-center gap-2">
                    <Input
                        autoFocus
                        className="flex-1 max-w-xs"
                        placeholder="Enter name…"
                        value={newName}
                        onChange={e => onNewNameChange(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') onAdd()
                            if (e.key === 'Escape') onCancelAdd()
                        }}
                    />
                    <Button size="sm" onClick={onAdd} disabled={!newName.trim() || addPending}>
                        {addPending ? '…' : 'Add'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground" onClick={onCancelAdd}>
                        <XCircle className="h-4 w-4" />
                    </Button>
                </div>
            ) : (
                <Button variant="ghost" size="sm" className="gap-1.5 text-primary font-medium" onClick={onStartAdd}>
                    <Plus className="h-3.5 w-3.5" /> {addLabel}
                </Button>
            )}
        </div>
    )
}

// ─── Grade Levels section ──────────────────────────────────────────────────────

function GradeLevelsSection() {
    const { data: items = [], isLoading } = useGradeLevels()
    const levels = Array.isArray(items) ? items as GradeLevel[] : []
    const create = useCreateGradeLevel()
    const update = useUpdateGradeLevel()

    const [newName, setNewName] = useState('')
    const [addingNew, setAddingNew] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [toggleTarget, setToggleTarget] = useState<GradeLevel | null>(null)

    function handleAdd() {
        const name = newName.trim()
        if (!name) return
        create.mutate({ name }, {
            onSuccess: () => { setNewName(''); setAddingNew(false); toast.success('Grade level added') },
            onError: (err: Error) => toast.error(err.message.includes('unique') ? 'Grade level already exists' : 'Failed to add'),
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
            onSuccess: () => {
                toast.success(toggleTarget.isActive ? `"${toggleTarget.name}" deactivated` : `"${toggleTarget.name}" activated`)
                setToggleTarget(null)
            },
            onError: () => { toast.error('Failed to update'); setToggleTarget(null) },
        })
    }

    return (
        <>
            <MasterList
                items={levels}
                isLoading={isLoading}
                addingNew={addingNew}
                newName={newName}
                editingId={editingId}
                editName={editName}
                addPending={create.isPending}
                onNewNameChange={setNewName}
                onStartAdd={() => setAddingNew(true)}
                onCancelAdd={() => { setAddingNew(false); setNewName('') }}
                onAdd={handleAdd}
                onStartEdit={(item) => { setEditingId(item.id); setEditName(item.name) }}
                onEditNameChange={setEditName}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={handleUpdate}
                onToggle={(item) => setToggleTarget(item as GradeLevel)}
                addLabel="Add grade level"
                emptyMessage="No grade levels yet. Add one to get started."
            />
            <ConfirmDialog
                open={!!toggleTarget}
                onOpenChange={o => !o && setToggleTarget(null)}
                title={toggleTarget?.isActive ? `Deactivate "${toggleTarget?.name}"?` : `Activate "${toggleTarget?.name}"?`}
                description={toggleTarget?.isActive
                    ? 'This grade level will be hidden from employee forms. Employees currently assigned this level are not affected.'
                    : 'This grade level will become available again in employee forms.'}
                confirmLabel={toggleTarget?.isActive ? 'Deactivate' : 'Activate'}
                variant={toggleTarget?.isActive ? 'destructive' : 'success'}
                onConfirm={handleToggle}
            />
        </>
    )
}

// ─── Sponsoring Entities section ───────────────────────────────────────────────

function SponsoringEntitiesSection() {
    const { data: items = [], isLoading } = useSponsoringEntities()
    const entities = Array.isArray(items) ? items as SponsoringEntity[] : []
    const create = useCreateSponsoringEntity()
    const update = useUpdateSponsoringEntity()

    const [newName, setNewName] = useState('')
    const [addingNew, setAddingNew] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [toggleTarget, setToggleTarget] = useState<SponsoringEntity | null>(null)

    function handleAdd() {
        const name = newName.trim()
        if (!name) return
        create.mutate({ name }, {
            onSuccess: () => { setNewName(''); setAddingNew(false); toast.success('Sponsoring entity added') },
            onError: (err: Error) => toast.error(err.message.includes('unique') ? 'Entity already exists' : 'Failed to add'),
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
            onSuccess: () => {
                toast.success(toggleTarget.isActive ? `"${toggleTarget.name}" deactivated` : `"${toggleTarget.name}" activated`)
                setToggleTarget(null)
            },
            onError: () => { toast.error('Failed to update'); setToggleTarget(null) },
        })
    }

    return (
        <>
            <MasterList
                items={entities}
                isLoading={isLoading}
                addingNew={addingNew}
                newName={newName}
                editingId={editingId}
                editName={editName}
                addPending={create.isPending}
                onNewNameChange={setNewName}
                onStartAdd={() => setAddingNew(true)}
                onCancelAdd={() => { setAddingNew(false); setNewName('') }}
                onAdd={handleAdd}
                onStartEdit={(item) => { setEditingId(item.id); setEditName(item.name) }}
                onEditNameChange={setEditName}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={handleUpdate}
                onToggle={(item) => setToggleTarget(item as SponsoringEntity)}
                addLabel="Add sponsoring entity"
                emptyMessage="No sponsoring entities yet. Add one to get started."
            />
            <ConfirmDialog
                open={!!toggleTarget}
                onOpenChange={o => !o && setToggleTarget(null)}
                title={toggleTarget?.isActive ? `Deactivate "${toggleTarget?.name}"?` : `Activate "${toggleTarget?.name}"?`}
                description={toggleTarget?.isActive
                    ? 'This sponsoring entity will be hidden from employee visa forms. Existing assignments are not affected.'
                    : 'This sponsoring entity will become available again in employee visa forms.'}
                confirmLabel={toggleTarget?.isActive ? 'Deactivate' : 'Activate'}
                variant={toggleTarget?.isActive ? 'destructive' : 'success'}
                onConfirm={handleToggle}
            />
        </>
    )
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export function GradeLevelsTab() {
    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-base font-semibold">Grade Levels & Sponsoring Entities</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Manage the master lists used across employee records. Changes apply to all employees going forward.
                </p>
            </div>

            <Section
                icon={GraduationCap}
                title="Grade Levels"
                description="Define grades or bands that can be assigned to employees (e.g. L1, L4, Grade 7)."
            >
                <GradeLevelsSection />
            </Section>

            <Section
                icon={Building2}
                title="Sponsoring Entities"
                description="Companies or entities that sponsor employee visas. Used in the Visa & ID section of employee profiles."
            >
                <SponsoringEntitiesSection />
            </Section>
        </div>
    )
}
