import { useState, useEffect, useRef } from 'react'
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

function splitName(full: string): { firstName: string; lastName: string } {
    const parts = full.trim().split(/\s+/)
    return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') }
}

// ─── Profile Tab — current user avatar / name / department ────────────────────
export function ProfileTab() {
    const { user, setUser } = useAuthStore()
    const [firstName, setFirstName] = useState(() => splitName(user?.name ?? '').firstName)
    const [lastName, setLastName] = useState(() => splitName(user?.name ?? '').lastName)
    const [department, setDepartment] = useState(user?.department ?? '')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [uploading, setUploading] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)

    // Sync form fields when the stored identity/name/department changes — but NOT on
    // every setUser call (e.g. avatar-only patches would reset in-progress edits).
    useEffect(() => {
        const { firstName: fn, lastName: ln } = splitName(user?.name ?? '')
        setFirstName(fn)
        setLastName(ln)
        setDepartment(user?.department ?? '')
    }, [user?.id, user?.name, user?.department])

    const initials = (user?.name ?? 'U')
        .split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase()

    const handlePickFile = () => fileRef.current?.click()

    const handleFile = async (file: File) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if (!allowed.includes(file.type)) {
            toast.error('Unsupported file', 'Please choose a JPEG, PNG, WEBP, or GIF image.')
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error('File too large', 'Maximum size is 5 MB.')
            return
        }
        try {
            setUploading(true)
            const fd = new FormData()
            fd.append('file', file)
            const res = await api.upload<{ data: { avatarUrl: string } }>('/auth/me/avatar', fd)
            // Cache-bust so the new image appears immediately
            const fresh = `${res.data.avatarUrl}?t=${Date.now()}`
            setUser({ avatarUrl: fresh })
            toast.success('Profile photo updated')
        } catch {
            toast.error('Upload failed', 'Could not update your profile photo.')
        } finally {
            setUploading(false)
            if (fileRef.current) fileRef.current.value = ''
        }
    }

    const handleSave = async () => {
        if (!firstName.trim()) {
            toast.error('First name is required')
            return
        }
        const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
        try {
            setSaving(true)
            const res = await api.patch<{ data: { name: string; department: string | null; avatarUrl: string | null } }>(
                '/auth/me',
                { name: fullName, department: department.trim() || null },
            )
            setUser({
                name: res.data.name,
                department: res.data.department ?? undefined,
                avatarUrl: res.data.avatarUrl ?? undefined,
            })
            setSaved(true)
            toast.success('Profile updated')
            setTimeout(() => setSaved(false), 2000)
        } catch {
            toast.error('Save failed', 'Could not update your profile.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-5">
            <SettingsCard>
                <div className="flex items-start gap-5 pb-5 border-b">
                    <div className="relative">
                        <Avatar className="h-20 w-20 border-2 border-border">
                            {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                            <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                                {initials}
                            </AvatarFallback>
                        </Avatar>
                        <button
                            type="button"
                            onClick={handlePickFile}
                            disabled={uploading}
                            className="absolute -bottom-1 -end-1 h-7 w-7 rounded-full bg-primary text-primary-foreground border-2 border-card shadow-sm flex items-center justify-center hover:bg-primary/90 disabled:opacity-50"
                            aria-label="Change profile photo"
                        >
                            <UserCircle className="h-3.5 w-3.5" />
                        </button>
                        <input
                            ref={fileRef}
                            type="file"
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
                                {user?.avatarUrl ? 'Change photo' : 'Upload photo'}
                            </Button>
                            <span className="text-[11px] text-muted-foreground">JPEG, PNG, WEBP, GIF · max 5 MB</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5">
                    <div>
                        <Label htmlFor="profile-first-name">First Name</Label>
                        <Input id="profile-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
                    </div>
                    <div>
                        <Label htmlFor="profile-last-name">Last Name</Label>
                        <Input id="profile-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
                    </div>
                    <div>
                        <Label htmlFor="profile-email">Email</Label>
                        <Input id="profile-email" value={user?.email ?? ''} disabled />
                        <p className="text-[11px] text-muted-foreground mt-1">Contact an admin to change your email.</p>
                    </div>
                    <div>
                        <Label htmlFor="profile-department">Department</Label>
                        <Input id="profile-department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. People Operations" />
                    </div>
                    <div>
                        <Label htmlFor="profile-role">Role</Label>
                        <Input id="profile-role" value={labelFor(user?.role)} disabled className="capitalize" />
                    </div>
                </div>

                <div className="flex justify-end pt-5">
                    <Button
                        onClick={handleSave}
                        loading={saving}
                        leftIcon={saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                        variant={saved ? 'success' : 'default'}
                    >
                        {saved ? 'Saved!' : 'Save Changes'}
                    </Button>
                </div>
            </SettingsCard>
        </div>
    )
}
