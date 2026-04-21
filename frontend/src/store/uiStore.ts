import { create } from 'zustand'
import type { Notification } from '@/types'
import { mockNotifications } from '@/data/mock'

interface UIState {
  sidebarOpen: boolean
  notifications: Notification[]
  unreadCount: number
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  markNotificationRead: (id: string) => void
  markAllRead: () => void
  addNotification: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
}

export const useUIStore = create<UIState>()((set, get) => ({
  sidebarOpen: true,
  notifications: mockNotifications,
  unreadCount: mockNotifications.filter(n => !n.read).length,
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  markNotificationRead: (id) => {
    const notifications = get().notifications.map(n => n.id === id ? { ...n, read: true } : n)
    set({ notifications, unreadCount: notifications.filter(n => !n.read).length })
  },
  markAllRead: () => {
    const notifications = get().notifications.map(n => ({ ...n, read: true }))
    set({ notifications, unreadCount: 0 })
  },
  addNotification: (n) => {
    const notification: Notification = {
      ...n,
      id: `N${Date.now()}`,
      timestamp: new Date().toISOString(),
      read: false,
    }
    const notifications = [notification, ...get().notifications]
    set({ notifications, unreadCount: notifications.filter(n => !n.read).length })
  },
}))
