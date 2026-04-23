'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, MessageSquare, Settings,
  Network, BarChart2, Mic, KanbanSquare,
  Bot, Shield, Sparkles, Briefcase, Flag,
} from 'lucide-react'
import { useAuthContext } from '@/lib/providers'

/* ── Nav structure (mirrors design handoff shell.jsx) ─────────────────── */
type NavItem = {
  href: string
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>
  kbd?: string
  live?: boolean
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/',         label: 'Dashboard',      icon: LayoutDashboard, kbd: 'D' },
      { href: '/pipeline', label: 'Pipeline',        icon: KanbanSquare,    kbd: 'P' },
      { href: '/session',  label: 'Sessions · Aria', icon: MessageSquare,   kbd: 'S' },
    ],
  },
  {
    label: 'Deal Intelligence',
    items: [
      { href: '/clients',   label: 'Deal Workspace', icon: Briefcase },
      { href: '/conflicts', label: 'Conflicts',       icon: Flag      },
    ],
  },
  {
    label: 'Firm',
    items: [
      { href: '/knowledge',          label: 'Knowledge Graph', icon: Network   },
      { href: '/knowledge/my-style', label: 'My Style',        icon: Sparkles  },
      { href: '/analytics',          label: 'Analytics',       icon: BarChart2 },
      { href: '/agents',             label: 'Agents',           icon: Bot       },
    ],
  },
]

/* ── User type ─────────────────────────────────────────────────────────── */
type AuthUser = {
  id: string
  email?: string
  name?: string
  googleDisplayName?: string
}

function initials(user: AuthUser | null): string {
  if (!user) return 'ME'
  const display = user.googleDisplayName ?? user.name ?? user.email ?? ''
  if (!display) return 'ME'
  const parts = display.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase()
  return display.slice(0, 2).toUpperCase()
}

function displayName(user: AuthUser | null): string {
  if (!user) return 'You'
  return user.googleDisplayName ?? user.name ?? user.email ?? 'You'
}

function orgLabel(user: AuthUser | null): string {
  if (!user) return 'AXIS Co-pilot'
  const email = user.email ?? ''
  const domain = email.split('@')[1] ?? ''
  if (!domain) return 'AXIS Co-pilot'
  // Remove common TLDs and capitalise the company part
  const company = domain.split('.')[0] ?? ''
  return company.charAt(0).toUpperCase() + company.slice(1)
}

/* ── Props ─────────────────────────────────────────────────────────────── */
type SidebarProps = {
  open?: boolean
  onNavigate?: () => void
}

export function Sidebar({ open = false, onNavigate = () => {} }: SidebarProps) {
  const pathname = usePathname()
  const { user } = useAuthContext()

  /* Active detection ─────────────────────────────────────────────────── */
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    if (href === '/session') return pathname.startsWith('/session')
    if (href === '/knowledge') return pathname === '/knowledge'
    return pathname.startsWith(href)
  }

  /* "Talk to Aria" href — re-use current session if we're already in one */
  const sessionMatch = pathname.match(/^\/session\/([^/?]+)/)
  const currentSessionId = sessionMatch?.[1] && sessionMatch[1] !== 'new' ? sessionMatch[1] : null
  const talkHref = currentSessionId
    ? `/session/${currentSessionId}?live=true&automic=true`
    : '/session/new?live=true&automic=true'

  return (
    <aside
      className={`ax-side app-sidebar ${open ? 'is-open' : ''}`}
      aria-label="Primary navigation"
    >
      {/* ── Brand mark ── */}
      <Link href="/" onClick={onNavigate} className="ax-brand" style={{ textDecoration: 'none' }}>
        <div className="ax-brand-mark">A</div>
        <div className="ax-brand-text">
          <div className="ax-brand-name">AXIS</div>
          <div className="ax-brand-sub">CO·PILOT</div>
        </div>
      </Link>

      {/* ── Talk to Aria ── */}
      <Link href={talkHref} onClick={onNavigate} className="ax-talk">
        <span className="ax-talk-dot" />
        <Mic size={13} />
        <span>Talk to Aria</span>
        <span className="ax-talk-kbd">⌃ Space</span>
      </Link>

      {/* ── Nav sections ── */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden auto' }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="ax-nav-section">{section.label}</div>
            <div className="ax-nav-group">
              {section.items.map((item, idx) => {
                const Icon = item.icon
                const active = isActive(item.href)
                // Deduplicate identical hrefs within a section (e.g. CIM/Memo both → /pipeline until deal-scoped)
                const key = `${section.label}-${item.label}-${idx}`
                return (
                  <Link
                    key={key}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={`ax-nav${active ? ' is-active' : ''}`}
                  >
                    <Icon size={15} className="ax-nav-ic" />
                    <span>{item.label}</span>
                    {item.live && (
                      <span className="ax-chip is-good" style={{ marginLeft: 'auto', fontSize: '10px', padding: '1px 6px' }}>
                        <span className="ax-chip-dot" style={{ animation: 'none' }} />
                        LIVE
                      </span>
                    )}
                    {!item.live && item.kbd && !active && (
                      <span className="ax-nav-kbd">{item.kbd}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Footer: settings + user chip ── */}
      <div className="ax-side-foot">
        <Link
          href="/admin/audit"
          onClick={onNavigate}
          className={`ax-nav${pathname.startsWith('/admin') ? ' is-active' : ''}`}
        >
          <Shield size={15} className="ax-nav-ic" />
          <span>Audit / Admin</span>
        </Link>

        <Link
          href="/settings"
          onClick={onNavigate}
          className={`ax-nav${pathname.startsWith('/settings') ? ' is-active' : ''}`}
        >
          <Settings size={15} className="ax-nav-ic" />
          <span>Settings</span>
        </Link>

        <div className="ax-user-chip">
          <div className="ax-avatar" aria-hidden="true">
            {initials(user)}
          </div>
          <div className="ax-user-meta">
            <div className="ax-user-name">{displayName(user)}</div>
            <div className="ax-user-org">{orgLabel(user)}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
