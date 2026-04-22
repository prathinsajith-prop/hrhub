import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export function AppLayout() {
  const { i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  return (
    <SidebarProvider>
      <AppSidebar side={isRtl ? 'right' : 'left'} />
      <SidebarInset>
        <SiteHeader />
        <main className="flex flex-1 flex-col gap-4 p-4 sm:p-5 lg:p-6 overflow-y-auto animate-fade-in">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
