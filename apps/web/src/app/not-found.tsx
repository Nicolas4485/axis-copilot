import Link from 'next/link'
import { FileQuestion } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
      <div className="card max-w-md w-full space-y-4">
        <div className="flex justify-center">
          <div className="p-3 rounded-full bg-[var(--gold)]/10">
            <FileQuestion size={32} className="text-[var(--gold)]" />
          </div>
        </div>

        <div>
          <h1 className="font-serif text-2xl text-[var(--gold)] mb-1">404</h1>
          <h2 className="font-serif text-lg text-[var(--text-primary)] mb-2">Page not found</h2>
          <p className="text-sm text-[var(--text-muted)]">
            This page doesn't exist or has been moved.
          </p>
        </div>

        <Link href="/" className="btn-primary inline-block">
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
