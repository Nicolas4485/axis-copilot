'use client'

// useAuth — verifies the httpOnly cookie session via AuthContext (single /api/auth/me call).
// Returns { ready: true } once confirmed. Redirects to /login on 401.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthContext } from './providers'

export function useAuth(): { ready: boolean } {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuthContext()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login')
    }
  }, [isLoading, isAuthenticated, router])

  return { ready: !isLoading && isAuthenticated }
}
