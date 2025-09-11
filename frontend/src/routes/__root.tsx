import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { useEffect } from 'react'
import { AppSidebar } from '@/components/app-sidebar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Plus } from 'lucide-react'
import { Toaster } from 'sonner'

const RootLayout = () => {
  const navigate = useNavigate()

  // Ensure there is always a session id in the URL
  useEffect(() => {
    const usp = new URLSearchParams(window.location.search)
    if (!usp.get('sid')) {
      const sid = 's_' + Math.random().toString(36).slice(2, 10)
      navigate({ to: '/', search: (prev: any) => ({ ...(prev ?? {}), sid }), replace: true })
    }
  }, [navigate])

  const startNewSession = () => {
    const sid = 's_' + Math.random().toString(36).slice(2, 10)
    navigate({ to: '/', search: (prev: any) => ({ ...(prev ?? {}), sid }) })
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-[98vh] overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2 px-4 justify-between bg-background border-b">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">
                    Building Your Application
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Data Fetching</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="ml-auto">
            <Button variant="outline" size="sm" className="gap-1" onClick={startNewSession}>
              <Plus className="size-3" /> New
            </Button>
          </div>
        </header>
        <div className="flex-1 min-h-0 overflow-hidden mx-auto w-full max-w-4xl">
          <Outlet />
        </div>
        <TanStackRouterDevtools />
        <Toaster position="bottom-right" richColors closeButton />
      </SidebarInset>
    </SidebarProvider>
  )
}

export const Route = createRootRoute({ component: RootLayout })
