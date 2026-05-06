'use client'

/**
 * ThemeToggle — compact light/dark switcher.
 *
 * Behavior:
 *  - Reads current theme from the <html data-theme="…"> attribute on mount
 *    (set pre-paint by the inline script in layout.tsx, so there's no flash).
 *  - Click to flip; writes to localStorage('axis-theme') so the choice persists.
 *  - Respects prefers-color-scheme as the default when nothing is stored.
 *
 * This component is additive — it never mutates data nor alters routes.
 */

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'axis-theme'

function readInitial(): Theme {
  if (typeof document === 'undefined') return 'light'
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark' || attr === 'light') return attr
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    /* localStorage not available — safe fallback */
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setTheme(readInitial())
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme, mounted])

  // Follow OS changes only when user has not explicitly chosen
  useEffect(() => {
    if (!mounted) return
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const handler = (e: MediaQueryListEvent) => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) return // user made a choice — don't override
      } catch {
        /* ignore */
      }
      setTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener?.('change', handler)
    return () => mq.removeEventListener?.('change', handler)
  }, [mounted])

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  // Avoid hydration mismatch — render a neutral placeholder pre-mount.
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        className={compact ? 'theme-toggle-btn theme-toggle-btn--compact' : 'theme-toggle-btn'}
        style={{ visibility: 'hidden' }}
      >
        <Sun size={14} />
      </button>
    )
  }

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={isDark}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={compact ? 'theme-toggle-btn theme-toggle-btn--compact' : 'theme-toggle-btn'}
    >
      {isDark ? <Sun size={14} /> : <Moon size={14} />}
      {!compact && <span>{isDark ? 'Light' : 'Dark'}</span>}
    </button>
  )
}
