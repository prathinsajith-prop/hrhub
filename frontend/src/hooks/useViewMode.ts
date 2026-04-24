import { useState } from 'react'

export type ViewMode = 'table' | 'grid'

export function useViewMode(storageKey: string, defaultMode: ViewMode = 'table'): [ViewMode, (v: ViewMode) => void] {
    const [mode, setMode] = useState<ViewMode>(() => {
        try {
            return (localStorage.getItem(`hrhub.view.${storageKey}`) as ViewMode) ?? defaultMode
        } catch {
            return defaultMode
        }
    })

    function set(v: ViewMode) {
        setMode(v)
        try { localStorage.setItem(`hrhub.view.${storageKey}`, v) } catch { /* noop */ }
    }

    return [mode, set]
}
