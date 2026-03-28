'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function SessionError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[session-error-boundary]', error.message, error.digest)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center h-screen p-8 text-center">
      <div className="card max-w-md w-full space-y-4">
        <div className="flex justify-center">
          <div className="p-3 rounded-full bg-[var(--error)]/10">
            <AlertTriangle size={28} className="text-[var(--error)]" />
          </div>
        </div>

        <div>
          <h2 className="font-serif text-lg text-[var(--text-primary)] mb-1">Session error</h2>
          <p className="text-sm text-[var(--text-muted)]">
            {error.message || 'Failed to load this session.'}
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="btn-primary flex items-center gap-2">
            <RefreshCw size={14} />
            Retry
          </button>
          <Link href="/" className="btn-secondary flex items-center gap-2">
            <ArrowLeft size={14} />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
