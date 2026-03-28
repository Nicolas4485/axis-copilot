'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'

// Dev token for nick@axis.ai — bypasses login during development
const DEV_TOKEN = process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? ''

export function Providers({ children }: { children: React.ReactNode }) {
  // Auto-set dev token on mount
  useEffect(() => {
    if (DEV_TOKEN) {
      localStorage.setItem('axis_token', DEV_TOKEN)
    }
  }, [])

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
      {children}
    </QueryClientProvider>
  )
}
