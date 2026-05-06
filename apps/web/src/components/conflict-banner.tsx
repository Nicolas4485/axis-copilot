'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { knowledge } from '@/lib/api'
import Link from 'next/link'
import { AlertTriangle, X } from 'lucide-react'

interface ConflictBannerProps {
  clientId: string | null | undefined
}

export function ConflictBanner({ clientId }: ConflictBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  const { data } = useQuery({
    queryKey: ['conflicts', clientId],
    queryFn: () => knowledge.getConflicts(clientId!),
    enabled: !!clientId,
    staleTime: 60_000,
  })

  const unresolvedCount = data?.conflicts.filter((c) => c.status === 'UNRESOLVED').length ?? 0

  if (!clientId || dismissed || unresolvedCount === 0) return null

  return (
    <div className="flex items-center justify-between px-4 py-2.5
                    bg-[var(--warning)]/[0.06] border-b border-[var(--warning)]/25
                    text-xs text-[var(--warning)]">
      <div className="flex items-center gap-2">
        <AlertTriangle size={13} className="shrink-0" />
        <span>
          <strong>{unresolvedCount}</strong> data conflict{unresolvedCount !== 1 ? 's' : ''} detected
          in your documents —&nbsp;
          <Link href={`/clients/${clientId}/conflicts`}
                className="underline underline-offset-2 hover:text-[var(--warning)] font-medium">
            Review →
          </Link>
        </span>
      </div>
      <button onClick={() => setDismissed(true)}
              aria-label="Dismiss conflict banner"
              className="p-0.5 rounded hover:bg-[var(--warning)]/20 transition-colors">
        <X size={12} />
      </button>
    </div>
  )
}
