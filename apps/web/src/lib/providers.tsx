'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

// Legacy: if NEXT_PUBLIC_DEV_TOKEN is set it still works.
// New path: login page calls POST /api/auth/login which handles dev mode automatically.
const DEV_TOKEN = process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? ''

const PUBLIC_PATHS = ['/login']

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Inject legacy dev token if provided via env
    if (DEV_TOKEN) {
      localStorage.setItem('axis_token', DEV_TOKEN)
    }

    const token = localStorage.getItem('axis_token')
    const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

    if (!token && !isPublic) {
      router.replace('/login')
      return
    }

    setReady(true)
  }, [pathname, router])

  if (!ready && !PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    // Prevent flash of authenticated content while checking token
    return null
  }

  return <>{children}</>
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGuard>
        {children}
      </AuthGuard>
    </QueryClientProvider>
  )
}
