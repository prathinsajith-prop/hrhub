import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, ArrowRight, MailCheck, KeyRound } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'

const schema = z.object({
    email: z.string().email('Please enter a valid email address'),
})
type FormValues = z.infer<typeof schema>

export function ForgotPasswordPage() {
    const [submitted, setSubmitted] = useState(false)
    const [submittedEmail, setSubmittedEmail] = useState('')
    const [devToken, setDevToken] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
        resolver: zodResolver(schema),
    })

    const onSubmit = async (values: FormValues) => {
        setLoading(true)
        try {
            const res = await api.post<{ data: { sent: boolean; devToken?: string } }>(
                '/auth/forgot-password',
                { email: values.email },
            )
            setSubmittedEmail(values.email)
            setDevToken(res?.data?.devToken ?? null)
            setSubmitted(true)
        } catch {
            // Generic message to avoid leaking enumeration details.
            setSubmittedEmail(values.email)
            setSubmitted(true)
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthLayout
            heroEyebrow="Account Recovery"
            heroTitle={<>Locked out?<br />We&rsquo;ll get you back in.</>}
            heroSubtitle="Reset links expire in 60 minutes and can only be used once. Your existing sessions will be revoked for security."
            heroContent={
                <div className="grid grid-cols-2 gap-4 max-w-sm">
                    {[
                        { v: '60 min', l: 'Link Validity' },
                        { v: 'One-time', l: 'Single Use' },
                        { v: 'TLS 1.3', l: 'Encrypted' },
                        { v: 'ISO 27001', l: 'Certified' },
                    ].map(s => (
                        <div key={s.l} className="rounded-xl border border-sidebar-border/40 bg-sidebar-accent/30 p-3">
                            <p className="text-xl font-bold text-sidebar-accent-foreground font-display">{s.v}</p>
                            <p className="text-[10px] text-sidebar-foreground/60 uppercase tracking-wider mt-0.5">{s.l}</p>
                        </div>
                    ))}
                </div>
            }
        >
            {!submitted ? (
                <>
                    <div className="mb-6">
                        <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary mb-4">
                            <KeyRound className="h-5 w-5" />
                        </div>
                        <h2 className="text-2xl font-bold text-foreground font-display tracking-tight">Forgot password?</h2>
                        <p className="text-sm text-muted-foreground mt-1.5">
                            Enter the email associated with your account and we&rsquo;ll send a secure reset link.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="email">Work email</Label>
                            <Input
                                id="email"
                                type="email"
                                autoComplete="email"
                                placeholder="you@company.ae"
                                {...register('email')}
                                aria-invalid={!!errors.email}
                            />
                            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                        </div>

                        <Button
                            type="submit"
                            className="w-full gap-2"
                            disabled={loading}
                        >
                            {loading ? 'Sending…' : (<>Send reset link <ArrowRight className="h-4 w-4" /></>)}
                        </Button>
                    </form>

                    <div className="mt-6 text-center">
                        <Link
                            to="/login"
                            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Back to sign in
                        </Link>
                    </div>
                </>
            ) : (
                <>
                    <div className="mb-6">
                        <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-success/10 text-success mb-4">
                            <MailCheck className="h-5 w-5" />
                        </div>
                        <h2 className="text-2xl font-bold text-foreground font-display tracking-tight">Check your inbox</h2>
                        <p className="text-sm text-muted-foreground mt-1.5">
                            If an account exists for{' '}
                            <span className="font-medium text-foreground">{submittedEmail}</span>, a reset link has
                            been sent. The link expires in 60 minutes.
                        </p>
                    </div>

                    {devToken && (
                        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 mb-4 text-xs space-y-2">
                            <p className="font-medium text-warning">Dev mode</p>
                            <p className="text-muted-foreground">
                                Email delivery is not configured. Use this link to continue:
                            </p>
                            <Link
                                to={`/reset-password?token=${devToken}`}
                                className="block break-all text-primary font-mono text-[11px] hover:underline"
                            >
                                /reset-password?token={devToken.slice(0, 24)}…
                            </Link>
                        </div>
                    )}

                    <div className="space-y-3">
                        <Button
                            variant="outline"
                            className={cn('w-full')}
                            onClick={() => {
                                setSubmitted(false)
                                setDevToken(null)
                            }}
                        >
                            Try another email
                        </Button>
                        <Link to="/login" className="block">
                            <Button variant="ghost" className="w-full gap-2">
                                <ArrowLeft className="h-4 w-4" /> Back to sign in
                            </Button>
                        </Link>
                    </div>

                    <p className="text-[11px] text-muted-foreground/70 text-center mt-6">
                        Didn&rsquo;t receive an email? Check your spam folder or contact{' '}
                        <a href="mailto:support@hrhub.ae" className="text-primary hover:underline">support@hrhub.ae</a>
                    </p>
                </>
            )}
        </AuthLayout>
    )
}

export default ForgotPasswordPage
