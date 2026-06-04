import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ViewMode = 'employee' | 'manager'

interface ViewModeState {
    mode: ViewMode
    setMode: (m: ViewMode) => void
    toggle: () => void
}

export const useViewModeStore = create<ViewModeState>()(
    persist(
        (set, get) => ({
            mode: 'employee',
            setMode: (m) => set({ mode: m }),
            toggle: () => set({ mode: get().mode === 'employee' ? 'manager' : 'employee' }),
        }),
        // Bumped to -v2 when the header view switch was removed: invalidates any
        // persisted 'manager' mode so every client re-initialises to 'employee'.
        { name: 'hrhub-portal-mode-v2' },
    ),
)
