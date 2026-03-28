// Reusable skeleton components for loading states

interface SkeletonProps {
  className?: string
}

/** Single line or block skeleton */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`bg-[var(--bg-tertiary)] rounded animate-pulse ${className}`}
      aria-hidden="true"
    />
  )
}

/** Card-shaped skeleton */
export function CardSkeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`card animate-pulse ${className}`} aria-hidden="true">
      <div className="space-y-3">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  )
}

/** Message bubble skeleton */
export function MessageSkeleton({ isUser = false }: { isUser?: boolean }) {
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`} aria-hidden="true">
      <div className={`max-w-2xl rounded-xl px-4 py-3 w-64 animate-pulse ${
        isUser
          ? 'bg-[var(--gold)]/10 border border-[var(--gold)]/20'
          : 'bg-[var(--bg-secondary)] border border-[var(--border)]'
      }`}>
        <Skeleton className="h-3 w-full mb-2" />
        <Skeleton className="h-3 w-4/5 mb-2" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  )
}

/** Table row skeleton */
export function TableRowSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-3 w-full" />
        </td>
      ))}
    </tr>
  )
}

/** Stat card skeleton for analytics */
export function StatCardSkeleton() {
  return (
    <div className="card animate-pulse" aria-hidden="true">
      <Skeleton className="h-3 w-20 mb-3" />
      <Skeleton className="h-7 w-24 mb-1" />
      <Skeleton className="h-2 w-16" />
    </div>
  )
}

/** Sidebar item skeleton */
export function SidebarItemSkeleton() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 animate-pulse" aria-hidden="true">
      <Skeleton className="h-4 w-4 rounded shrink-0" />
      <Skeleton className="h-3 flex-1" />
    </div>
  )
}
