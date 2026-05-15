import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewMode = 'employee' | 'manager'

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
        { name: 'hrhub-portal-mode' },
    ),
)
