import { BellIcon, SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useLocation } from "react-router-dom"

const pageTitle: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/employees": "Employees",
  "/recruitment": "Recruitment",
  "/onboarding": "Onboarding",
  "/visa": "Visa & PRO Services",
  "/documents": "Documents",
  "/payroll": "Payroll",
  "/leave": "Leave Management",
  "/compliance": "Compliance",
  "/reports": "Reports",
  "/settings": "Settings",
}

export function SiteHeader() {
  const location = useLocation()
  const base = "/" + location.pathname.split("/")[1]
  const title = pageTitle[base] ?? "HRHub"

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-2 h-4" />
      <h1 className="text-base font-semibold text-foreground">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        {/* Search */}
        <Button variant="outline" size="sm" className="hidden md:flex gap-2 text-muted-foreground w-52 justify-start">
          <SearchIcon className="size-3.5" />
          <span className="text-xs">Search anything…</span>
          <kbd className="ml-auto pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
            ⌘K
          </kbd>
        </Button>

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <BellIcon className="size-4" />
              <Badge className="absolute -right-0.5 -top-0.5 h-4 w-4 p-0 flex items-center justify-center text-[9px]">
                3
              </Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="p-3 border-b">
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-xs text-muted-foreground">3 unread messages</p>
            </div>
            <div className="divide-y">
              {[
                { title: "3 visa documents expiring", time: "2h ago", type: "warning" },
                { title: "Payroll run due tomorrow", time: "5h ago", type: "info" },
                { title: "New hire onboarding pending", time: "1d ago", type: "default" },
              ].map((n, i) => (
                <div key={i} className="flex gap-3 p-3 hover:bg-muted/50 cursor-pointer">
                  <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${n.type === "warning" ? "bg-warning" :
                      n.type === "info" ? "bg-info" : "bg-primary"
                    }`} />
                  <div>
                    <p className="text-xs font-medium">{n.title}</p>
                    <p className="text-[11px] text-muted-foreground">{n.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-2 border-t">
              <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
                View all notifications
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  )
}
