export default function RootLoading() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-[var(--bg-tertiary)] rounded-lg" />
          <div className="h-4 w-64 bg-[var(--bg-tertiary)] rounded" />
        </div>
        <div className="h-6 w-24 bg-[var(--bg-tertiary)] rounded-full" />
      </div>

      {/* Quick start grid skeleton */}
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card h-20 bg-[var(--bg-tertiary)]" />
        ))}
      </div>

      {/* Two-column content skeleton */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="h-6 w-32 bg-[var(--bg-tertiary)] rounded mb-3" />
          <div className="card h-32 bg-[var(--bg-tertiary)]" />
        </div>
        <div className="space-y-2">
          <div className="h-6 w-24 bg-[var(--bg-tertiary)] rounded mb-3" />
          <div className="card h-32 bg-[var(--bg-tertiary)]" />
        </div>
      </div>
    </div>
  )
}
