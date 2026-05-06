'use client'

// AppShellClient — renders the full app shell (sidebar + top bar + wake word)
// for authenticated pages. Shows just the children (no chrome) on /login
// and /register. Redirects to /login if the auth cookie is missing.
//
// Responsive: at ≤1023px the sidebar becomes a slide-in drawer triggered by
// the hamburger in the top bar. A scrim covers content while the drawer is
// open; clicking the scrim or pressing Esc closes it. The drawer closes
// automatically on navigation or when the viewport grows back past 1024px.

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'
import { WakeWordListener } from './aria/wake-word'
import { useAuth } from '@/lib/use-auth'

const AUTH_FREE_PATHS = ['/login', '/register']

export function AppShellClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthFree = AUTH_FREE_PATHS.some((p) => pathname.startsWith(p))

  // Auth guard — only runs for protected routes
  const { ready } = useAuth()

  // Drawer state (mobile only; ignored on desktop via CSS)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const openDrawer  = useCallback(() => setDrawerOpen(true), [])

  // Close the drawer when the route changes.
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // Close on Esc, and auto-close when viewport grows past the breakpoint.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    const onResize = () => {
      if (window.innerWidth >= 1024) setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    // Prevent body scroll while drawer open
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      document.body.style.overflow = prevOverflow
    }
  }, [drawerOpen])

  if (isAuthFree) {
    return <>{children}</>
  }

  // Hold render until auth check completes (avoids flash of protected content)
  if (!ready) return null

  return (
    <>
      <WakeWordListener />
      <div className="print-shell flex h-screen overflow-hidden">
        <div className="print-hide" data-sidebar>
          <Sidebar open={drawerOpen} onNavigate={closeDrawer} />
        </div>

        {/* Scrim — visible only when drawer is open (mobile). */}
        <div
          className={`app-scrim print-hide ${drawerOpen ? 'is-open' : ''}`}
          onClick={closeDrawer}
          aria-hidden={!drawerOpen}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <div className="print-hide">
            <TopBar onHamburger={openDrawer} />
          </div>
          <main className="print-main flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </>
  )
}
