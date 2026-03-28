'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function RootError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Log to observability in production
    console.error('[root-error-boundary]', error.message, error.digest)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
      <div className="card max-w-md w-full space-y-4">
        <div className="flex justify-center">
          <div className="p-3 rounded-full bg-[var(--error)]/10">
            <AlertTriangle size={32} className="text-[var(--error)]" />
          </div>
        </div>

        <div>
          <h1 className="font-serif text-xl text-[var(--text-primary)] mb-1">
            Something went wrong
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            {error.message || 'An unexpected error occurred. Please try again.'}
          </p>
          {error.digest && (
            <p className="text-xs text-[var(--text-muted)] mt-2 font-mono">
              Error ID: {error.digest}
            </p>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="btn-primary flex items-center gap-2">
            <RefreshCw size={14} />
            Try again
          </button>
          <a href="/" className="btn-secondary">
            Go home
          </a>
        </div>
      </div>
    </div>
  )
}
