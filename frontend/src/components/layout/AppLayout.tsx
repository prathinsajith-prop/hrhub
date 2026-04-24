import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export function AppLayout() {
  const { i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  return (
    <SidebarProvider>
      <AppSidebar side={isRtl ? 'right' : 'left'} />
      <SidebarInset>
        <SiteHeader />
        <main className="flex flex-1 flex-col gap-3 px-3 py-3 sm:px-4 sm:py-3 lg:px-5 lg:py-4 overflow-y-auto animate-fade-in">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
