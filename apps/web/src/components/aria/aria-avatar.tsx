'use client'

// AriaAvatar — animated state indicator for Aria
// Shows different animations based on Aria's current state

import type { AriaState } from '@/lib/use-aria-live'

interface AriaAvatarProps {
  state: AriaState
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_MAP = {
  sm: 'w-10 h-10',
  md: 'w-16 h-16',
  lg: 'w-24 h-24',
}

const STATE_COLORS: Record<AriaState, string> = {
  idle: 'bg-[var(--border)]',
  connecting: 'bg-yellow-500/50',
  listening: 'bg-[var(--gold)]',
  thinking: 'bg-blue-400',
  speaking: 'bg-emerald-400',
  delegating: 'bg-purple-400',
  error: 'bg-red-400',
}

const STATE_LABELS: Record<AriaState, string> = {
  idle: 'Ready',
  connecting: 'Connecting...',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  delegating: 'Working...',
  error: 'Error',
}

export function AriaAvatar({ state, size = 'md' }: AriaAvatarProps) {
  const sizeClass = SIZE_MAP[size]
  const colorClass = STATE_COLORS[state]
  const isAnimating = state !== 'idle' && state !== 'error'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`${sizeClass} rounded-full relative flex items-center justify-center`}>
        {/* Outer pulse ring */}
        {isAnimating && (
          <div
            className={`absolute inset-0 rounded-full ${colorClass} opacity-30`}
            style={{
              animation: state === 'listening' ? 'pulse 2s ease-in-out infinite' :
                         state === 'speaking' ? 'pulse 1s ease-in-out infinite' :
                         state === 'thinking' ? 'spin 2s linear infinite' :
                         state === 'delegating' ? 'spin 3s linear infinite' :
                         'pulse 3s ease-in-out infinite',
            }}
          />
        )}

        {/* Core circle */}
        <div
          className={`w-3/4 h-3/4 rounded-full ${colorClass} flex items-center justify-center transition-colors duration-300`}
        >
          <span className="text-xs font-mono text-white font-bold">A</span>
        </div>
      </div>

      {size !== 'sm' && (
        <span className="text-xs text-[var(--text-muted)] font-mono">
          {STATE_LABELS[state]}
        </span>
      )}
    </div>
  )
}
