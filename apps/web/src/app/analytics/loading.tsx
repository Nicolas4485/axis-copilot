import { StatCardSkeleton, Skeleton } from '@/components/skeleton'

export default function AnalyticsLoading() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <Skeleton className="h-8 w-32" />

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="card animate-pulse">
        <Skeleton className="h-5 w-40 mb-6" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>

      {/* Table skeleton */}
      <div className="card animate-pulse">
        <Skeleton className="h-5 w-36 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-3 w-1/4" />
              <Skeleton className="h-3 w-1/4" />
              <Skeleton className="h-3 w-1/4" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
