'use client'

/**
 * TopBar — sticky chrome above every protected page.
 *
 * Layout, left-to-right:
 *   [hamburger ≤1023px] [breadcrumb]  ···spacer···  [search] [notifs] [+ New] [theme]
 *
 * Uses .ax-top design-system classes from globals.css (design handoff).
 * Internal logic and routing are unchanged from the previous version.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Menu, Plus, Search } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'

const ROUTE_LABELS: Record<string, string> = {
  '':             'Dashboard',
  session:        'Sessions',
  pipeline:       'Pipeline',
  deals:          'Deals',
  clients:        'Clients',
  knowledge:      'Knowledge',
  'my-style':     'My Style',
  analytics:      'Analytics',
  agents:         'Agents',
  admin:          'Admin',
  audit:          'Audit Log',
  'rag-eval':     'RAG Eval',
  settings:       'Settings',
  conflicts:      'Conflicts',
  login:          'Sign in',
  register:       'Create account',
  new:            'New',
  memo:           'IC Memo',
  documents:      'Documents',
  'cim-analysis': 'CIM Analysis',
}

function titleCase(seg: string) {
  if (ROUTE_LABELS[seg]) return ROUTE_LABELS[seg]
  if (/^[0-9a-f-]{8,}$/i.test(seg)) return seg.slice(0, 8) + '…'
  return seg
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function buildCrumbs(pathname: string): { label: string; href: string }[] {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return [{ label: 'Dashboard', href: '/' }]
  const crumbs: { label: string; href: string }[] = []
  let acc = ''
  for (const part of parts) {
    acc += '/' + part
    crumbs.push({ label: titleCase(part), href: acc })
  }
  return crumbs
}

export function TopBar({ onHamburger }: { onHamburger?: () => void }) {
  const pathname = usePathname() || '/'
  const crumbs = buildCrumbs(pathname)

  return (
    <header className="ax-top">
      {/* Hamburger — mobile only (hidden via CSS on ≥1024px) */}
      <button
        type="button"
        className="app-hamburger"
        aria-label="Open navigation"
        onClick={onHamburger}
        style={{ flexShrink: 0 }}
      >
        <Menu size={18} />
      </button>

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="ax-crumb" style={{ flex: 1, minWidth: 0 }}>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <span key={c.href} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {i > 0 && <span className="ax-crumb-sep" aria-hidden="true">/</span>}
              {last ? (
                <b aria-current="page">{c.label}</b>
              ) : (
                <Link href={c.href} className="ax-crumb-link">{c.label}</Link>
              )}
            </span>
          )
        })}
      </nav>

      {/* Search */}
      <label className="ax-search" aria-label="Search">
        <Search size={13} style={{ flexShrink: 0 }} />
        <input
          type="search"
          placeholder="Search deals, companies, documents…"
        />
        <kbd className="ax-kbd">⌘K</kbd>
      </label>

      {/* Notifications */}
      <button type="button" className="ax-icon-btn" aria-label="Notifications" title="Notifications">
        <Bell size={14} />
      </button>

      {/* New session CTA */}
      <Link href="/session/new" className="ax-btn is-primary" aria-label="Start new session">
        <Plus size={13} />
        <span>New session</span>
      </Link>

      <ThemeToggle compact />
    </header>
  )
}
