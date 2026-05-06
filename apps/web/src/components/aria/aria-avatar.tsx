'use client'

// AriaAvatar — animated state indicator for Aria's live session
// Uses concentric rings + color states to communicate what Aria is doing

import type { AriaState } from '@/lib/use-aria-live'

interface AriaAvatarProps {
  state: AriaState
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_MAP = {
  sm: { outer: 'w-9 h-9',   inner: 'w-5 h-5',  label: false },
  md: { outer: 'w-14 h-14', inner: 'w-8 h-8',  label: true  },
  lg: { outer: 'w-24 h-24', inner: 'w-14 h-14', label: true  },
}

const STATE_CONFIG: Record<AriaState, {
  color: string
  ring: string
  pulse: boolean
  spin: boolean
  label: string
}> = {
  idle:       { color: 'bg-[var(--border)]',      ring: 'border-[var(--border)]',      pulse: false, spin: false, label: 'Ready'       },
  connecting: { color: 'bg-yellow-500/60',         ring: 'border-yellow-500/40',        pulse: true,  spin: false, label: 'Connecting'  },
  listening:  { color: 'bg-[var(--gold)]',         ring: 'border-[var(--gold)]/50',     pulse: true,  spin: false, label: 'Listening'   },
  thinking:   { color: 'bg-blue-400',              ring: 'border-blue-400/50',          pulse: false, spin: true,  label: 'Thinking'    },
  speaking:   { color: 'bg-emerald-400',           ring: 'border-emerald-400/50',       pulse: true,  spin: false, label: 'Speaking'    },
  delegating: { color: 'bg-violet-400',            ring: 'border-violet-400/40',        pulse: false, spin: true,  label: 'Delegating'  },
  error:      { color: 'bg-[var(--error)]',        ring: 'border-[var(--error)]/40',    pulse: false, spin: false, label: 'Error'       },
}

export function AriaAvatar({ state, size = 'md' }: AriaAvatarProps) {
  const cfg  = STATE_CONFIG[state]
  const dims = SIZE_MAP[size]
  const isActive = state !== 'idle' && state !== 'error'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`${dims.outer} relative flex items-center justify-center`}>

        {/* Outer ripple ring — only when active */}
        {isActive && (
          <div
            className={`absolute inset-0 rounded-full border-2 ${cfg.ring}`}
            style={{
              animation: cfg.spin
                ? 'spin 2.5s linear infinite'
                : 'ripple 2s ease-out infinite',
            }}
          />
        )}

        {/* Second ripple ring for speaking state — extra energy */}
        {state === 'speaking' && (
          <div
            className={`absolute inset-0 rounded-full border ${cfg.ring}`}
            style={{ animation: 'ripple 2s ease-out infinite', animationDelay: '0.7s' }}
          />
        )}

        {/* Mid ring */}
        <div className={`absolute inset-[15%] rounded-full border ${cfg.ring} opacity-40`} />

        {/* Core */}
        <div className={`${dims.inner} rounded-full ${cfg.color} relative z-10 flex items-center justify-center
                         transition-colors duration-500`}>
          {/* Subtle "A" monogram */}
          <span className="text-[var(--bg-primary)] font-serif font-bold select-none"
                style={{ fontSize: size === 'lg' ? '18px' : size === 'md' ? '12px' : '8px' }}>
            A
          </span>
        </div>
      </div>

      {/* State label — only for md/lg */}
      {dims.label && (
        <p className="text-[11px] font-mono tracking-widest uppercase text-[var(--text-muted)]">
          {cfg.label}
        </p>
      )}
    </div>
  )
}
