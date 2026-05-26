import { useEffect, useState } from 'react'

/**
 * Ticks every second so a check-in / check-out button can show a live
 * `H:MM:SS` duration. When `endIso` is set, the duration freezes at
 * `end − start`; when only `startIso` is set, it counts up from now.
 *
 * Returns `'0:00:00'` for nullish / unparseable input so call sites can
 * render the value directly without a fallback ternary.
 *
 * Lifted out of `AttendancePage.tsx` so both the portal and the main
 * HR app can drive their punch-band timers from the same source.
 */
export function useLiveDuration(
    startIso: string | null | undefined,
    endIso: string | null | undefined,
): string {
    const [now, setNow] = useState(() => Date.now())
    const running = !!startIso && !endIso

    useEffect(() => {
        if (!running) return
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
    }, [running])

    if (!startIso) return '0:00:00'
    const startMs = Date.parse(startIso)
    if (Number.isNaN(startMs)) return '0:00:00'
    const endMs = endIso ? Date.parse(endIso) : now
    const secs = Math.max(0, Math.floor((endMs - startMs) / 1000))
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
