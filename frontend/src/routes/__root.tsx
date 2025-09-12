import { createRootRoute, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { useEffect } from 'react'
import { AppSidebar } from '@/components/app-sidebar'
import { Button } from '@/components/ui/button'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Plus } from 'lucide-react'
import { Toaster } from 'sonner'

const RootLayout = () => {
  const navigate = useNavigate()
  const { location } = useRouterState()
  
  // Check if we're on home route
  const isHomeRoute = location.pathname === '/'
  // Check if we're on empty home (no session id suggests empty state)
  const isEmptyHome = isHomeRoute && (!location.search || !location.search.sid)

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
          </div>
          <div className="ml-auto">
            {location.pathname.startsWith('/cases') ? (
              <Link to="/cases/new" preload={false}>
                <Button size="sm" className="gap-1 bg-teal-700 text-white hover:bg-teal-600">
                  <Plus className="size-3" /> New Case
                </Button>
              </Link>
            ) : !isEmptyHome ? (
              <Button variant="outline" size="sm" className="gap-1" onClick={startNewSession}>
                <Plus className="size-3" /> New
              </Button>
            ) : null}
          </div>
        </header>
        <div className={`flex-1 min-h-0 ${isHomeRoute ? 'overflow-hidden mx-auto w-full max-w-4xl' : 'overflow-y-auto w-full px-6 pt-4'}`}>
          <Outlet />
        </div>
        <TanStackRouterDevtools />
        <Toaster position="bottom-right" richColors closeButton />
      </SidebarInset>
    </SidebarProvider>
  )
}

export const Route = createRootRoute({ component: RootLayout })
