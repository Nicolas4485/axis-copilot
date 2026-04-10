'use client'

// useAuth — redirects to /login if axis_token is missing from localStorage.
// Use this in any layout or client component that wraps protected pages.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export function useAuth(): { ready: boolean } {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('axis_token')
    if (!token) {
      router.replace('/login')
    } else {
      setReady(true)
    }
  }, [router])

  return { ready }
}
