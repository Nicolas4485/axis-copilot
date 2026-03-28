import { CardSkeleton, Skeleton } from '@/components/skeleton'

export default function ClientLoading() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-pulse">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      {/* Meta cards */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card animate-pulse">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-5 w-28" />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 animate-pulse border-b border-[var(--border)] pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20" />
        ))}
      </div>

      {/* Content */}
      <div className="grid grid-cols-2 gap-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  )
}
