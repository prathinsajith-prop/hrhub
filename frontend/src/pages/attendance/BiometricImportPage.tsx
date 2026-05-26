/**
 * Biometric mapping + external-API integration page.
 *
 *   • Biometric ID mapping  — list + add + remove employee↔device mappings
 *   • External API           — surface the punch-event endpoint URL and
 *                              point HR at Connected Apps for token issuance
 *
 * Bulk Excel import lives on the main Attendance page now (Import dialog) so
 * a tab here would duplicate it. Both tabs are HR-only via the router guard.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Fingerprint, ArrowLeft, Plus, Trash2, Copy, Send, Pencil,
    Webhook, KeyRound, Code2, Terminal, ShieldCheck, Upload,
} from 'lucide-react'
import { BulkMappingsImportDialog } from './BulkMappingsImportDialog'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, Input, Label } from '@/components/ui/primitives'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
    ConfirmDialog, toast,
} from '@/components/ui/overlays'
import { EmployeeSelect } from '@/components/shared'
import { formatDate } from '@/lib/utils'
import {
    useBiometricMappings, useCreateMapping, useUpdateMapping, useDeleteMapping,
    type BiometricMapping,
} from '@/hooks/useBiometric'

export default function BiometricImportPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    return (
        <PageWrapper>
            <PageHeader
                title={t('biometric.title', 'Attendance integrations')}
                description={t('biometric.subtitle', 'Map biometric device IDs to employees and bulk-import punch records')}
                actions={
                    <Button variant="ghost" size="sm" onClick={() => navigate('/attendance')} className="gap-1.5">
                        <ArrowLeft className="size-4" />
                        {t('biometric.back', 'Back to attendance')}
                    </Button>
                }
            />

            <Tabs defaultValue="mapping" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="mapping" className="gap-1.5">
                        <Fingerprint className="size-3.5" />
                        {t('biometric.tabs.mapping', 'Biometric ID mapping')}
                    </TabsTrigger>
                    <TabsTrigger value="external" className="gap-1.5">
                        <Webhook className="size-3.5" />
                        {t('biometric.tabs.external', 'External API')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="mapping" className="space-y-4">
                    <BiometricMappingTab />
                </TabsContent>

                <TabsContent value="external" className="space-y-4">
                    <ExternalApiTab />
                </TabsContent>
            </Tabs>
        </PageWrapper>
    )
}

// ─── Biometric ID mapping ───────────────────────────────────────────────────

function BiometricMappingTab() {
    const { t } = useTranslation()
    const { data, isLoading } = useBiometricMappings()
    const remove = useDeleteMapping()
    const [addOpen, setAddOpen] = useState(false)
    const [bulkOpen, setBulkOpen] = useState(false)
    const [editing, setEditing] = useState<BiometricMapping | null>(null)
    const [removing, setRemoving] = useState<BiometricMapping | null>(null)
    const rows = data ?? []

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{t('biometric.mapping.title', 'Employee ↔ device ID mappings')}</h2>
                    <p className="text-[11px] text-muted-foreground">
                        {t('biometric.mapping.subtitle', 'Each row links a biometric device user (or external system ID) to an HRHub employee — so punch imports can resolve which row belongs to which person.')}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)} className="gap-1.5">
                        <Upload className="size-4" />
                        {t('biometric.mapping.bulkImport', 'Bulk import')}
                    </Button>
                    <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
                        <Plus className="size-4" />
                        {t('biometric.mapping.add', 'Add mapping')}
                    </Button>
                </div>
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium">{t('biometric.mapping.col.mapperId', 'Mapper ID')}</th>
                                <th className="px-3 py-2 text-left font-medium">{t('biometric.mapping.col.employee', 'Employee')}</th>
                                <th className="px-3 py-2 text-left font-medium">{t('biometric.mapping.col.label', 'Label')}</th>
                                <th className="px-3 py-2 text-left font-medium">{t('biometric.mapping.col.created', 'Added')}</th>
                                <th className="px-3 py-2 text-right font-medium">{t('common.actions', 'Actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {isLoading ? (
                                // Render 3 placeholder rows that match the column shape so the
                                // table doesn't collapse during the fetch.
                                Array.from({ length: 3 }).map((_, i) => (
                                    <tr key={`bm-skel-${i}`}>
                                        <td className="px-3 py-3"><Skeleton className="h-4 w-24" /></td>
                                        <td className="px-3 py-3"><Skeleton className="h-4 w-40" /></td>
                                        <td className="px-3 py-3"><Skeleton className="h-4 w-32" /></td>
                                        <td className="px-3 py-3"><Skeleton className="h-4 w-20" /></td>
                                        <td className="px-3 py-3 text-right"><Skeleton className="h-7 w-16 ms-auto" /></td>
                                    </tr>
                                ))
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-3 py-12 text-center">
                                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                            <Fingerprint className="size-8 opacity-30" />
                                            <p>{t('biometric.mapping.empty', 'No mappings yet')}</p>
                                            <p className="text-[11px] text-muted-foreground/80 max-w-md">
                                                {t('biometric.mapping.emptyHint', 'Add a mapping for each biometric / device user ID that you want to recognise during punch imports.')}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : rows.map((r) => (
                                <tr key={r.id} className="hover:bg-muted/30">
                                    <td className="px-3 py-2">
                                        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold">
                                            <Fingerprint className="size-3 text-muted-foreground" />
                                            {r.mapperId}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="font-medium">{r.employeeName}</div>
                                        <div className="text-[10px] text-muted-foreground">
                                            {r.employeeNo}{r.department ? ` · ${r.department}` : ''}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.label || '—'}</td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                                        {formatDate(r.createdAt)}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setEditing(r)}
                                                aria-label="Edit mapping"
                                                title={t('common.edit', 'Edit') as string}
                                                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted/40"
                                            >
                                                <Pencil className="size-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setRemoving(r)}
                                                aria-label="Remove mapping"
                                                title={t('common.remove', 'Remove') as string}
                                                className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800 transition-colors hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <AddMappingDialog open={addOpen} onOpenChange={setAddOpen} />
            <BulkMappingsImportDialog open={bulkOpen} onOpenChange={setBulkOpen} />
            <EditMappingDialog
                mapping={editing}
                onClose={() => setEditing(null)}
            />
            <ConfirmDialog
                open={!!removing}
                onOpenChange={(v) => !v && setRemoving(null)}
                title={t('biometric.mapping.removeTitle', 'Remove this mapping?')}
                description={t('biometric.mapping.removeDesc',
                    `Mapper ID '${removing?.mapperId ?? ''}' will no longer resolve to ${removing?.employeeName ?? 'this employee'} during punch imports.`)}
                variant="destructive"
                confirmLabel={t('common.remove', 'Remove')}
                onConfirm={async () => {
                    if (!removing) return
                    await remove.mutateAsync(removing.id)
                    setRemoving(null)
                }}
            />
        </div>
    )
}

function AddMappingDialog({
    open, onOpenChange,
}: {
    open: boolean
    onOpenChange: (v: boolean) => void
}) {
    const { t } = useTranslation()
    const create = useCreateMapping()
    const [employeeId, setEmployeeId] = useState('')
    const [mapperId, setMapperId] = useState('')
    const [label, setLabel] = useState('')

    const reset = () => { setEmployeeId(''); setMapperId(''); setLabel('') }

    const canSubmit = !!employeeId && !!mapperId.trim()
    const handleSubmit = async () => {
        if (!canSubmit) return
        try {
            await create.mutateAsync({
                employeeId,
                mapperId: mapperId.trim(),
                label: label.trim() || null,
            })
            toast.success(t('biometric.mapping.createSuccess', 'Mapping added'))
            reset()
            onOpenChange(false)
        } catch {
            /* hook surfaces the toast */
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
            <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
                <DialogHeader className="space-y-0 p-6 pb-4 border-b bg-gradient-to-br from-sky-50/60 to-indigo-50/40 dark:from-sky-950/20 dark:to-indigo-950/15">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm shadow-indigo-500/20">
                            <Fingerprint className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-base font-semibold">{t('biometric.mapping.addTitle', 'Add user ID mapping')}</DialogTitle>
                            <DialogDescription className="mt-0.5 text-xs">
                                {t('biometric.mapping.addDesc', 'Link a biometric device user ID (or external system ID) to an HRHub employee.')}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="px-6 py-4 space-y-4 bg-muted/20">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                            {t('biometric.mapping.field.employee', 'Employee')}
                            <span className="ms-0.5 text-rose-600">*</span>
                        </Label>
                        <EmployeeSelect value={employeeId} onValueChange={setEmployeeId} />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                            {t('biometric.mapping.field.mapperId', 'Mapper ID')}
                            <span className="ms-0.5 text-rose-600">*</span>
                        </Label>
                        <Input
                            value={mapperId}
                            onChange={(e) => setMapperId(e.target.value)}
                            placeholder={t('biometric.mapping.field.mapperIdPlaceholder', 'e.g. 101, BIO-A1, EMP_007') as string}
                        />
                        <p className="text-[10px] text-muted-foreground">
                            {t('biometric.mapping.field.mapperIdHint', 'The exact ID the device or external system uses for this person.')}
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">{t('biometric.mapping.field.label', 'Label (optional)')}</Label>
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder={t('biometric.mapping.field.labelPlaceholder', 'e.g. Office finger reader') as string}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t bg-background px-6 py-3">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancel')}</Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit} loading={create.isPending} className="gap-1.5">
                        <Send className="size-3.5" />
                        {t('biometric.mapping.submit', 'Add mapping')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Edit dialog for an existing mapping. Locks the Employee field (re-binding
 * a mapper_id to a different employee is a delete + create, not an update —
 * historical punches reference the mapping_id, so swapping the employee
 * silently would rewrite history). Mapper_id + label are editable.
 */
function EditMappingDialog({
    mapping,
    onClose,
}: {
    mapping: BiometricMapping | null
    onClose: () => void
}) {
    const { t } = useTranslation()
    const update = useUpdateMapping()
    // Local form state — initialized from the row when the dialog opens.
    // State-during-render syncs back when the parent swaps the target row.
    const [mapperId, setMapperId] = useState('')
    const [label, setLabel] = useState('')
    const [lastId, setLastId] = useState<string | null>(null)
    if (mapping && mapping.id !== lastId) {
        setLastId(mapping.id)
        setMapperId(mapping.mapperId)
        setLabel(mapping.label ?? '')
    }
    if (!mapping && lastId !== null) {
        setLastId(null)
    }

    const trimmed = mapperId.trim()
    const labelTrimmed = label.trim()
    const dirty = !!mapping && (
        trimmed !== mapping.mapperId.trim()
        || labelTrimmed !== (mapping.label ?? '').trim()
    )
    const canSubmit = !!mapping && !!trimmed && dirty

    const handleSubmit = async () => {
        if (!mapping || !canSubmit) return
        try {
            await update.mutateAsync({
                id: mapping.id,
                // Only send fields that changed — keeps the PATCH minimal
                // and avoids triggering an "already mapped" 409 when the
                // mapper_id wasn't touched.
                mapperId: trimmed !== mapping.mapperId.trim() ? trimmed : undefined,
                label: labelTrimmed !== (mapping.label ?? '').trim() ? (labelTrimmed || null) : undefined,
            })
            toast.success(t('biometric.mapping.updateSuccess', 'Mapping updated'))
            onClose()
        } catch {
            /* hook surfaces the toast */
        }
    }

    return (
        <Dialog open={!!mapping} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
                <DialogHeader className="space-y-0 p-6 pb-4 border-b bg-gradient-to-br from-sky-50/60 to-indigo-50/40 dark:from-sky-950/20 dark:to-indigo-950/15">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm shadow-indigo-500/20">
                            <Pencil className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-base font-semibold">
                                {t('biometric.mapping.editTitle', 'Edit user ID mapping')}
                            </DialogTitle>
                            <DialogDescription className="mt-0.5 text-xs">
                                {t('biometric.mapping.editDesc',
                                    'Rename the mapper ID or update the device label. Re-assigning to a different employee requires removing and recreating the mapping.')}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="px-6 py-4 space-y-4 bg-muted/20">
                    {/* Read-only employee panel — re-binding the mapping
                        to a different employee would rewrite punch history,
                        so the field is locked. */}
                    {mapping && (
                        <div className="rounded-md border bg-card p-3">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                                {t('biometric.mapping.field.employee', 'Employee')}
                            </div>
                            <div className="font-medium">{mapping.employeeName}</div>
                            <div className="text-[10px] text-muted-foreground">
                                {mapping.employeeNo}{mapping.department ? ` · ${mapping.department}` : ''}
                            </div>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                            {t('biometric.mapping.field.mapperId', 'Mapper ID')}
                            <span className="ms-0.5 text-rose-600">*</span>
                        </Label>
                        <Input
                            value={mapperId}
                            onChange={(e) => setMapperId(e.target.value)}
                            placeholder={t('biometric.mapping.field.mapperIdPlaceholder', 'e.g. 101, BIO-A1, EMP_007') as string}
                            autoFocus
                        />
                        <p className="text-[10px] text-muted-foreground">
                            {t('biometric.mapping.field.mapperIdHint', 'The exact ID the device or external system uses for this person.')}
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">{t('biometric.mapping.field.label', 'Label (optional)')}</Label>
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder={t('biometric.mapping.field.labelPlaceholder', 'e.g. Office finger reader') as string}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t bg-background px-6 py-3">
                    <Button variant="ghost" onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        loading={update.isPending}
                        className="gap-1.5"
                    >
                        <Send className="size-3.5" />
                        {t('biometric.mapping.saveChanges', 'Save changes')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}


// ─── External API integration ───────────────────────────────────────────────
//
// Surfaces the endpoint URL a biometric device vendor (or any third party)
// posts punch events to, and points HR at Connected Apps for token issuance.
// Intentionally minimal: no request/response samples or Swagger link, since
// exposing the full API surface on an HR-facing page broadens the attack
// surface without helping the legitimate user (device vendor receives the
// integration spec out-of-band).
function ExternalApiTab() {
    const { t } = useTranslation()
    const navigate = useNavigate()

    // Resolve the API origin once. `VITE_API_URL` wins when set (Vercel/Railway
    // deploys); fall back to the dev proxy origin so localhost just works.
    // Drop the trailing `/api/v1` from `apiBase` to derive the public origin
    // we use to template the path-keyed `/api/ext/...` endpoint.
    const apiOrigin = useMemo(() => {
        const env = import.meta.env.VITE_API_URL as string | undefined
        const fromEnv = env?.trim()
        const raw = fromEnv && fromEnv.length > 0
            ? fromEnv
            : (typeof window !== 'undefined' ? `${window.location.origin}/api/v1` : '/api/v1')
        return raw.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '')
    }, [])
    // The {appKey} placeholder is a template — vendor swaps it for their own
    // app_live_… key generated on the Connected Apps page. The secret is
    // never rendered here; HR copies it once from the reveal modal.
    const endpoint = `${apiOrigin}/api/ext/{appKey}/attendance/punch`
    const sampleBody = `{
  "employeeId": "<EMPLOYEE_UUID>",
  "punchType": "in",
  "timestamp": "${new Date().toISOString()}",
  "deviceId": "lobby-reader-01",
  "source": "biometric"
}`
    const curlExample = `curl -X POST '${apiOrigin}/api/ext/{appKey}/attendance/punch' \\
  -H 'X-API-Secret: <APP_SECRET>' \\
  -H 'Content-Type: application/json' \\
  -d '${sampleBody.replace(/\n\s*/g, ' ').trim()}'`
    const jsExample = `const res = await fetch(
  '${apiOrigin}/api/ext/{appKey}/attendance/punch',
  {
    method: 'POST',
    headers: {
      'X-API-Secret': '<APP_SECRET>',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      employeeId: '<EMPLOYEE_UUID>',
      punchType: 'in',
      // timestamp is optional — server uses 'now' when omitted
      source: 'biometric',
    }),
  },
)
if (!res.ok) throw new Error(\`Punch failed: \${res.status}\`)
const { data } = await res.json()`

    const copy = async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value)
            toast.success(t('biometric.external.copied', 'Copied'), label)
        } catch {
            toast.error(t('biometric.external.copyFailed', 'Copy failed'), label)
        }
    }

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-sm font-semibold">
                    {t('biometric.external.title', 'External application endpoint')}
                </h2>
                <p className="text-[11px] text-muted-foreground">
                    {t(
                        'biometric.external.subtitle',
                        'Send punch events directly into HRHub from a biometric device, mobile app, or any third-party system using the Connected Apps key pair.',
                    )}
                </p>
            </div>

            {/* Auth pattern explainer */}
            <Card className="p-4 space-y-3 bg-muted/20">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                    <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('biometric.external.authLabel', 'How authentication works')}
                    </Label>
                </div>
                <ul className="text-xs text-muted-foreground leading-relaxed space-y-1.5 list-disc pl-5">
                    <li>
                        The <strong className="text-foreground font-mono">App Key</strong>
                        {' '}(<code className="text-[11px]">app_live_…</code>) sits in the URL path
                        — it identifies which integration is calling.
                    </li>
                    <li>
                        The <strong className="text-foreground font-mono">App Secret</strong>
                        {' '}(<code className="text-[11px]">sk_…</code>) travels in the
                        {' '}<code className="text-[11px]">X-API-Secret</code> request header.
                        Stored as a bcrypt hash on the server — plain text is never written to disk.
                    </li>
                    <li>
                        Every call is verified, scope-checked (<code className="text-[11px]">attendance:write</code>), and tagged
                        to the issuing tenant — no cross-tenant access is possible.
                    </li>
                </ul>
            </Card>

            {/* Endpoint URL */}
            <Card className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                    <Webhook className="size-4 text-muted-foreground" />
                    <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('biometric.external.urlLabel', 'POST endpoint')}
                    </Label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <code className="flex-1 min-w-0 truncate rounded-md border bg-muted/30 px-3 py-2 text-xs font-mono">
                        {endpoint}
                    </code>
                    <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 shrink-0"
                        onClick={() => copy(endpoint, 'Endpoint URL')}
                    >
                        <Copy className="size-3.5" />
                        {t('biometric.external.copy', 'Copy')}
                    </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                    {t('biometric.external.method', 'Replace {appKey} with your App Key. Send the App Secret in the X-API-Secret header.')}
                </p>
            </Card>

            {/* Tokens — sole way to call this endpoint */}
            <Card className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                    <KeyRound className="size-4 text-muted-foreground" />
                    <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('biometric.external.tokensLabel', 'API keys')}
                    </Label>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    {t(
                        'biometric.external.tokensHint',
                        'Generate an App Key + App Secret in Connected Apps with the attendance:write scope. The secret is shown only once at creation — keep a copy. Rotate or revoke from the same page if a device is lost.',
                    )}
                </p>
                <div className="pt-1">
                    <Button size="sm" className="gap-1.5" onClick={() => navigate('/apps')}>
                        <KeyRound className="size-3.5" />
                        {t('biometric.external.manageTokens', 'Manage API keys in Connected Apps')}
                    </Button>
                </div>
            </Card>

            {/* cURL example */}
            <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Terminal className="size-4 text-muted-foreground" />
                        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {t('biometric.external.curlLabel', 'cURL example')}
                        </Label>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => copy(curlExample, 'cURL')}
                    >
                        <Copy className="size-3.5" />
                        {t('biometric.external.copy', 'Copy')}
                    </Button>
                </div>
                <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-[11px] font-mono leading-relaxed whitespace-pre">
{curlExample}
                </pre>
            </Card>

            {/* JS example */}
            <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Code2 className="size-4 text-muted-foreground" />
                        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {t('biometric.external.jsLabel', 'JavaScript (fetch)')}
                        </Label>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => copy(jsExample, 'JavaScript')}
                    >
                        <Copy className="size-3.5" />
                        {t('biometric.external.copy', 'Copy')}
                    </Button>
                </div>
                <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-[11px] font-mono leading-relaxed whitespace-pre">
{jsExample}
                </pre>
            </Card>

            {/* Request body reference */}
            <Card className="p-4 space-y-3">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('biometric.external.bodyLabel', 'Request body')}
                </Label>
                <div className="overflow-x-auto rounded-md border bg-card">
                    <table className="w-full text-[11px]">
                        <thead className="bg-muted/40">
                            <tr className="text-left">
                                <th className="px-3 py-2 font-semibold">Field</th>
                                <th className="px-3 py-2 font-semibold">Type</th>
                                <th className="px-3 py-2 font-semibold">Required</th>
                                <th className="px-3 py-2 font-semibold">Notes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            <tr>
                                <td className="px-3 py-2 font-mono">employeeId</td>
                                <td className="px-3 py-2 text-muted-foreground">string (uuid)</td>
                                <td className="px-3 py-2 text-emerald-700 dark:text-emerald-400">yes</td>
                                <td className="px-3 py-2 text-muted-foreground">Must belong to your tenant.</td>
                            </tr>
                            <tr>
                                <td className="px-3 py-2 font-mono">punchType</td>
                                <td className="px-3 py-2 text-muted-foreground">"in" | "out"</td>
                                <td className="px-3 py-2 text-emerald-700 dark:text-emerald-400">yes</td>
                                <td className="px-3 py-2 text-muted-foreground">Direction of the punch.</td>
                            </tr>
                            <tr>
                                <td className="px-3 py-2 font-mono">timestamp</td>
                                <td className="px-3 py-2 text-muted-foreground">ISO-8601 string</td>
                                <td className="px-3 py-2 text-muted-foreground">no</td>
                                <td className="px-3 py-2 text-muted-foreground">Defaults to server time when omitted.</td>
                            </tr>
                            <tr>
                                <td className="px-3 py-2 font-mono">deviceId</td>
                                <td className="px-3 py-2 text-muted-foreground">string</td>
                                <td className="px-3 py-2 text-muted-foreground">no</td>
                                <td className="px-3 py-2 text-muted-foreground">Free-form device identifier.</td>
                            </tr>
                            <tr>
                                <td className="px-3 py-2 font-mono">source</td>
                                <td className="px-3 py-2 text-muted-foreground">"biometric" | "api" | "mobile"</td>
                                <td className="px-3 py-2 text-muted-foreground">no</td>
                                <td className="px-3 py-2 text-muted-foreground">Stored on the punch's notes.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    )
}
