import { useState, useRef } from 'react'
import { Save, CheckCircle2, UserCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from '@/components/ui/overlays'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import { labelFor } from '@/lib/enums'
import { SettingsCard } from './_shared'
import { useTranslation } from 'react-i18next'

function splitName(full: string): { firstName: string; lastName: string } {
    const parts = full.trim().split(/\s+/)
    return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') }
}

// ─── Profile Tab - current user avatar / name / department ────────────────────
export function ProfileTab() {
    const { t } = useTranslation()
    const { user, setUser } = useAuthStore()
    const [firstName, setFirstName] = useState(() => splitName(user?.name ?? '').firstName)
    const [lastName, setLastName] = useState(() => splitName(user?.name ?? '').lastName)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [uploading, setUploading] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)

    // Sync form fields when the stored identity/name changes - but NOT on every setUser
    // call (e.g. avatar-only patches would reset in-progress edits). Track the
    // composite key in state so we only re-sync when id or name actually changes.
    const userKey = `${user?.id ?? ''}:${user?.name ?? ''}`
    const [prevUserKey, setPrevUserKey] = useState(userKey)
    if (userKey !== prevUserKey) {
        setPrevUserKey(userKey)
        const { firstName: fn, lastName: ln } = splitName(user?.name ?? '')
        setFirstName(fn)
        setLastName(ln)
    }

    const initials = (user?.name ?? 'U')
        .split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase()

    const handlePickFile = () => fileRef.current?.click()

    const handleFile = async (file: File) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if (!allowed.includes(file.type)) {
            toast.error(t('settingsDetail.profile.unsupportedFile'), t('settingsDetail.profile.unsupportedFileDesc'))
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error(t('settingsDetail.profile.fileTooLarge'), t('settingsDetail.profile.fileTooLargeDesc'))
            return
        }
        try {
            setUploading(true)
            const fd = new FormData()
            fd.append('file', file)
            const res = await api.upload<{ data: { avatarUrl: string } }>('/auth/me/avatar', fd)
            setUser({ avatarUrl: res.data.avatarUrl })
            toast.success(t('settingsDetail.profile.photoUpdated'))
        } catch {
            toast.error(t('settingsDetail.profile.uploadFailed'), t('settingsDetail.profile.uploadFailedDesc'))
        } finally {
            setUploading(false)
            if (fileRef.current) fileRef.current.value = ''
        }
    }

    const handleSave = async () => {
        if (!firstName.trim()) {
            toast.error(t('settingsDetail.profile.firstNameRequired'))
            return
        }
        const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
        try {
            setSaving(true)
            const res = await api.patch<{ data: { name: string; department: string | null; avatarUrl: string | null } }>(
                '/auth/me',
                { name: fullName },
            )
            setUser({
                name: res.data.name,
                department: res.data.department ?? undefined,
                avatarUrl: res.data.avatarUrl ?? undefined,
            })
            setSaved(true)
            toast.success(t('settingsDetail.profile.profileUpdated'))
            setTimeout(() => setSaved(false), 2000)
        } catch {
            toast.error(t('settingsDetail.profile.saveFailed'), t('settingsDetail.profile.saveFailedDesc'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-5">
            <SettingsCard>
                <div className="flex items-start gap-5 pb-5 border-b">
                    <div className="relative">
                        <Avatar className="size-20 border-2 border-border">
                            {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                            <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                                {initials}
                            </AvatarFallback>
                        </Avatar>
                        <button
                            type="button"
                            onClick={handlePickFile}
                            disabled={uploading}
                            className="absolute -bottom-1 -end-1 size-7 rounded-full bg-primary text-primary-foreground border-2 border-card shadow-sm flex items-center justify-center hover:bg-primary/90 disabled:opacity-50"
                            aria-label={t('settingsDetail.profile.changePhoto')}
                        >
                            <UserCircle className="size-3.5" />
                        </button>
                        <input
                            ref={fileRef}
                            type="file"
                            aria-label={t('settingsDetail.profile.changePhoto')}
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) handleFile(f)
                            }}
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{user?.name ?? '—'}</p>
                        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                        <p className="text-[11px] text-muted-foreground capitalize mt-1">
                            {labelFor(user?.role)}
                            {user?.department ? ` · ${user.department}` : ''}
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={handlePickFile} loading={uploading}>
                                {user?.avatarUrl ? t('settingsDetail.profile.changePhoto') : t('settingsDetail.profile.uploadPhoto')}
                            </Button>
                            <span className="text-[11px] text-muted-foreground">{t('settingsDetail.profile.photoHint')}</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5">
                    <div>
                        <Label htmlFor="profile-first-name">{t('settingsDetail.profile.firstName')}</Label>
                        <Input id="profile-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
                    </div>
                    <div>
                        <Label htmlFor="profile-last-name">{t('settingsDetail.profile.lastName')}</Label>
                        <Input id="profile-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
                    </div>
                    <div>
                        <Label htmlFor="profile-email">{t('common.email')}</Label>
                        <Input id="profile-email" value={user?.email ?? ''} disabled />
                        <p className="text-[11px] text-muted-foreground mt-1">{t('settingsDetail.profile.emailHint')}</p>
                    </div>
                    <div>
                        <Label htmlFor="profile-role">{t('team.role')}</Label>
                        <Input id="profile-role" value={labelFor(user?.role)} disabled className="capitalize" />
                    </div>
                </div>

                <div className="flex justify-end pt-5">
                    <Button
                        onClick={handleSave}
                        loading={saving}
                        leftIcon={saved ? <CheckCircle2 className="size-4" /> : <Save className="size-4" />}
                        variant={saved ? 'success' : 'default'}
                    >
                        {saved ? t('settingsDetail.profile.saved') : t('settingsDetail.profile.saveChanges')}
                    </Button>
                </div>
            </SettingsCard>
        </div>
    )
}
