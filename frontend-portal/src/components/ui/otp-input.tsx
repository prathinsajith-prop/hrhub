import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

export interface OtpInputProps {
    /** Controlled value — the digits entered so far (0..length chars). */
    value: string
    /** Fires with the new digits-only string on every change. */
    onChange: (value: string) => void
    /** Called once the user has filled every box. */
    onComplete?: (value: string) => void
    length?: number
    autoFocus?: boolean
    disabled?: boolean
    /** Visual error state (red ring). */
    invalid?: boolean
    'aria-label'?: string
}

/**
 * Segmented one-time-code input — `length` individual single-digit boxes that
 * behave like one field. Built for the 2FA challenge:
 *
 *   - typing a digit fills the active box and advances focus
 *   - Backspace clears the current box (or steps back when already empty)
 *   - ← / → arrows move between boxes; Home / End jump to the ends
 *   - pasting a code fills every box and auto-submits when complete
 *   - autoComplete="one-time-code" so iOS/Android offer the SMS/authenticator code
 *
 * Digits-only by design (TOTP). Backup codes keep the regular text input.
 */
export function OtpInput({
    value,
    onChange,
    onComplete,
    length = 6,
    autoFocus = false,
    disabled = false,
    invalid = false,
    'aria-label': ariaLabel = 'Verification code',
}: OtpInputProps) {
    const refs = useRef<Array<HTMLInputElement | null>>([])
    const digits = value.split('').slice(0, length)

    const focusBox = (i: number) => {
        const el = refs.current[Math.max(0, Math.min(length - 1, i))]
        el?.focus()
        el?.select()
    }

    const commit = (next: string) => {
        const clean = next.replace(/\D/g, '').slice(0, length)
        onChange(clean)
        if (clean.length === length) onComplete?.(clean)
        return clean
    }

    const handleChange = (index: number, raw: string) => {
        const typed = raw.replace(/\D/g, '')
        if (!typed) return
        // Keep everything before this box, append what was typed (covers both a
        // single keystroke and an autofill that dumps the whole code into one box).
        const merged = (value.slice(0, index) + typed).replace(/\D/g, '').slice(0, length)
        const clean = commit(merged)
        focusBox(clean.length >= length ? length - 1 : index + typed.length)
    }

    const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace') {
            e.preventDefault()
            const chars = value.split('')
            if (chars[index]) {
                chars[index] = ''
                onChange(chars.join('').replace(/\s/g, ''))
            } else if (index > 0) {
                chars[index - 1] = ''
                onChange(chars.join('').replace(/\s/g, ''))
                focusBox(index - 1)
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault(); focusBox(index - 1)
        } else if (e.key === 'ArrowRight') {
            e.preventDefault(); focusBox(index + 1)
        } else if (e.key === 'Home') {
            e.preventDefault(); focusBox(0)
        } else if (e.key === 'End') {
            e.preventDefault(); focusBox(length - 1)
        }
    }

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault()
        const pasted = e.clipboardData.getData('text')
        const clean = commit(pasted)
        focusBox(clean.length >= length ? length - 1 : clean.length)
    }

    return (
        <div className="flex items-center justify-center gap-2 sm:gap-2.5" role="group" aria-label={ariaLabel}>
            {Array.from({ length }).map((_, i) => (
                <input
                    key={i}
                    ref={(el) => { refs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    pattern="[0-9]*"
                    maxLength={1}
                    autoFocus={autoFocus && i === 0}
                    disabled={disabled}
                    aria-label={`${ariaLabel} digit ${i + 1}`}
                    value={digits[i] ?? ''}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={handlePaste}
                    onFocus={(e) => e.target.select()}
                    className={cn(
                        'size-12 rounded-xl border bg-white/90 text-center text-xl font-semibold tabular-nums shadow-sm outline-none transition-all sm:size-14',
                        'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:bg-card/70',
                        digits[i] ? 'border-indigo-300 text-foreground dark:border-indigo-700' : 'border-input text-foreground',
                        invalid && 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/30',
                        disabled && 'cursor-not-allowed opacity-60',
                    )}
                />
            ))}
        </div>
    )
}
