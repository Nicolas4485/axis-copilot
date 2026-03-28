import { MessageSkeleton } from '@/components/skeleton'

export default function SessionLoading() {
  return (
    <div className="flex flex-col h-screen">
      {/* Header skeleton */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0 animate-pulse">
        <div className="h-5 w-48 bg-[var(--bg-tertiary)] rounded" />
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-7 w-16 bg-[var(--bg-tertiary)] rounded-md" />
          ))}
        </div>
      </header>

      {/* Messages area skeleton */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <MessageSkeleton isUser />
        <MessageSkeleton />
        <MessageSkeleton isUser />
        <MessageSkeleton />
      </div>

      {/* Input bar skeleton */}
      <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-secondary)] shrink-0 animate-pulse">
        <div className="flex items-center gap-2 max-w-4xl mx-auto">
          <div className="h-9 w-9 bg-[var(--bg-tertiary)] rounded-lg" />
          <div className="h-10 flex-1 bg-[var(--bg-tertiary)] rounded-lg" />
          <div className="h-9 w-16 bg-[var(--bg-tertiary)] rounded-lg" />
        </div>
      </div>
    </div>
  )
}
