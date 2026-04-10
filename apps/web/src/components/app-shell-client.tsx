'use client'

// AppShellClient — renders the full app shell (sidebar + wake word) for authenticated pages.
// Shows just the children (no sidebar) on the /login page.

import { usePathname } from 'next/navigation'
import { Sidebar } from './sidebar'
import { WakeWordListener } from './aria/wake-word'

const AUTH_FREE_PATHS = ['/login']

export function AppShellClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthFree = AUTH_FREE_PATHS.some((p) => pathname.startsWith(p))

  if (isAuthFree) {
    return <>{children}</>
  }

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
