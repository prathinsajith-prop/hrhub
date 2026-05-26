import { useState } from 'react'
import { Plus, Pencil, Check, XCircle, Briefcase, Upload } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast, ConfirmDialog } from '@/components/ui/overlays'
import { BulkImportDialog } from '@/components/shared/BulkImportDialog'
import { useDesignations, useCreateDesignation, useUpdateDesignation } from '@/hooks/useDesignations'
import type { Designation } from '@/hooks/useDesignations'
import { Section } from './_shared'
import { useTranslation } from 'react-i18next'

export function DesignationsTab() {
    const { t } = useTranslation()
    const qc = useQueryClient()
    const { data: items = [], isLoading } = useDesignations()
    const designations = Array.isArray(items) ? items as Designation[] : []
    const create = useCreateDesignation()
    const update = useUpdateDesignation()

    const [newName, setNewName] = useState('')
    const [addingNew, setAddingNew] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [toggleTarget, setToggleTarget] = useState<Designation | null>(null)
    const [importOpen, setImportOpen] = useState(false)

    function handleAdd() {
        const name = newName.trim()
        if (!name) return
        create.mutate({ name }, {
            onSuccess: () => { setNewName(''); setAddingNew(false); toast.success(t('orgSettings.designations.added')) },
            onError: (err: Error) => toast.error(err.message.includes('unique') ? t('orgSettings.designations.alreadyExists') : t('orgSettings.designations.addFailed')),
        })
    }

    function handleUpdate(id: string) {
        const name = editName.trim()
        if (!name) return
        update.mutate({ id, data: { name } }, {
            onSuccess: () => { setEditingId(null); toast.success(t('orgSettings.designations.updated')) },
            onError: (err: Error) => toast.error(err.message.includes('unique') ? t('orgSettings.designations.nameExists') : t('orgSettings.designations.updateFailed')),
        })
    }

    function handleToggle() {
        if (!toggleTarget) return
        update.mutate({ id: toggleTarget.id, data: { isActive: !toggleTarget.isActive } }, {
            onSuccess: () => {
                toast.success(toggleTarget.isActive
                    ? t('orgSettings.designations.deactivated', { name: toggleTarget.name })
                    : t('orgSettings.designations.activated', { name: toggleTarget.name }))
                setToggleTarget(null)
            },
            onError: () => { toast.error(t('orgSettings.designations.toggleFailed')); setToggleTarget(null) },
        })
    }

    return (
        <>
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold">{t('orgSettings.designations.title')}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {t('orgSettings.designations.desc')}
                    </p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setImportOpen(true)}>
                    <Upload className="size-3.5" />
                    Bulk import
                </Button>
            </div>

            <Section icon={Briefcase} title={t('orgSettings.designations.jobTitlesTitle')} description={t('orgSettings.designations.jobTitlesDesc')}>
                <div className="space-y-2">
                    {isLoading ? (
                        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={`div-${i}`} className="h-9 rounded-lg" />)}</div>
                    ) : designations.length === 0 && !addingNew ? (
                        <p className="text-sm text-muted-foreground text-center py-4">{t('orgSettings.designations.empty')}</p>
                    ) : (
                        <div className="divide-y divide-border/50 rounded-lg border bg-background">
                            {designations.map(d => (
                                <div key={d.id} className="flex items-center gap-2 px-3 py-2.5">
                                    {editingId === d.id ? (
                                        <>
                                            <Input
                                                className="flex-1 h-8"
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleUpdate(d.id)
                                                    if (e.key === 'Escape') setEditingId(null)
                                                }}
                                            />
                                            <Button size="sm" variant="ghost" className="size-7 p-0 text-emerald-600 hover:text-emerald-700" onClick={() => handleUpdate(d.id)}>
                                                <Check className="size-4" />
                                            </Button>
                                            <Button size="sm" variant="ghost" className="size-7 p-0 text-muted-foreground" onClick={() => setEditingId(null)}>
                                                <XCircle className="size-4" />
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <span className={cn('flex-1 text-sm font-medium', !d.isActive && 'line-through text-muted-foreground')}>{d.name}</span>
                                            {!d.isActive && (
                                                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium shrink-0">{t('common.inactive')}</span>
                                            )}
                                            <Button
                                                size="sm" variant="ghost"
                                                className="size-7 p-0 text-muted-foreground hover:text-foreground"
                                                title={t('common.edit')}
                                                onClick={() => { setEditingId(d.id); setEditName(d.name) }}
                                            >
                                                <Pencil className="size-3.5" />
                                            </Button>
                                            <Button
                                                size="sm" variant="outline"
                                                className={cn('text-xs h-6 px-2 rounded-full font-medium', d.isActive
                                                    ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                                    : 'border-muted-foreground/30 text-muted-foreground hover:bg-muted')}
                                                title={d.isActive ? t('orgSettings.designations.deactivateLabel') : t('orgSettings.designations.activateLabel')}
                                                onClick={() => setToggleTarget(d)}
                                            >
                                                {d.isActive ? t('common.active') : t('common.inactive')}
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
                                className="flex-1"
                                placeholder={t('orgSettings.designations.placeholder')}
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleAdd()
                                    if (e.key === 'Escape') { setAddingNew(false); setNewName('') }
                                }}
                            />
                            <Button size="sm" onClick={handleAdd} disabled={!newName.trim() || create.isPending}>
                                {create.isPending ? '…' : t('common.add')}
                            </Button>
                            <Button size="sm" variant="ghost" className="size-9 p-0 text-muted-foreground" onClick={() => { setAddingNew(false); setNewName('') }}>
                                <XCircle className="size-4" />
                            </Button>
                        </div>
                    ) : (
                        <Button variant="ghost" size="sm" className="gap-1.5 text-primary font-medium mt-1" onClick={() => setAddingNew(true)}>
                            <Plus className="size-3.5" /> {t('orgSettings.designations.addDesignation')}
                        </Button>
                    )}
                </div>
            </Section>
        </div>

        <ConfirmDialog
            open={!!toggleTarget}
            onOpenChange={o => !o && setToggleTarget(null)}
            title={toggleTarget?.isActive
                ? t('orgSettings.designations.deactivateConfirmTitle', { name: toggleTarget?.name })
                : t('orgSettings.designations.activateConfirmTitle', { name: toggleTarget?.name })}
            description={toggleTarget?.isActive
                ? t('orgSettings.designations.deactivateConfirmDesc')
                : t('orgSettings.designations.activateConfirmDesc')}
            confirmLabel={toggleTarget?.isActive ? t('orgSettings.designations.deactivateLabel') : t('orgSettings.designations.activateLabel')}
            variant={toggleTarget?.isActive ? 'destructive' : 'success'}
            onConfirm={handleToggle}
        />

        {/* Bulk import — template / upload / preview / commit wizard. Same
            shape and shared component used by Public Holidays + Performance
            Reviews + Biometric punches, so the UX is identical everywhere. */}
        <BulkImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            config={{
                title: 'Import designations',
                description: 'Upload an .xlsx or .csv of job titles. Validates each row before saving.',
                fileLabel: 'designations file',
                templateUrl: '/designations/import/template',
                validateUrl: '/designations/import/validate',
                commitUrl: '/designations/import/commit',
                columns: [
                    { key: 'name', label: 'Name', hint: 'Required. Max 120 chars. Must be unique per tenant.' },
                    { key: 'sortOrder', label: 'Sort order', hint: 'Optional integer for display ordering. Defaults to 0.' },
                    { key: 'isActive', label: 'Active', hint: 'true / false. Defaults to true.' },
                ],
                onCommitted: () => {
                    qc.invalidateQueries({ queryKey: ['designations'] })
                    toast.success('Designations imported', 'Your job-title list is now up to date.')
                },
            }}
        />
</>
    )
}
