'use client'

// AppShellClient — renders the full app shell (sidebar + wake word) for authenticated pages.
// Shows just the children (no sidebar) on the /login page.
// Redirects to /login if axis_token is missing (all non-auth-free routes).

import { usePathname } from 'next/navigation'
import { Sidebar } from './sidebar'
import { WakeWordListener } from './aria/wake-word'
import { useAuth } from '@/lib/use-auth'

const AUTH_FREE_PATHS = ['/login']

export function AppShellClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthFree = AUTH_FREE_PATHS.some((p) => pathname.startsWith(p))

  // Auth guard — only runs for protected routes
  const { ready } = useAuth()

  if (isAuthFree) {
    return <>{children}</>
  }

  // Hold render until auth check completes (avoids flash of protected content)
  if (!ready) return null

  return (
    <>
      <WakeWordListener />
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </>
  )
}
