'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, MessageSquare, Users, Settings, Network, BarChart2, FileText } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/session/new', label: 'New Session', icon: MessageSquare },
  { href: '/knowledge', label: 'Knowledge', icon: Network },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
] as const

const CLIENT_ITEMS = [
  { href: '/clients', label: 'Clients', icon: Users },
] as const

export function Sidebar() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    if (href === '/session/new') return pathname.startsWith('/session')
    return pathname.startsWith(href)
  }

  return (
    <aside className="w-56 h-screen flex flex-col bg-[var(--bg-secondary)] border-r border-[var(--border)] shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-[var(--border)]">
        <Link href="/">
          <h1 className="font-serif text-2xl text-[var(--gold)] tracking-wide">AXIS</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">AI Consulting Co-pilot</p>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider px-3 py-1.5">
          Workspace
        </p>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-[var(--gold)]/10 text-[var(--gold)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          )
        })}

        <div className="pt-3">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider px-3 py-1.5">
            Clients
          </p>
          {CLIENT_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-[var(--gold)]/10 text-[var(--gold)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            )
          })}
        </div>

        <div className="pt-3">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider px-3 py-1.5">
            Content
          </p>
          <Link
            href="/knowledge?tab=documents"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname === '/knowledge'
                ? 'bg-[var(--gold)]/10 text-[var(--gold)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <FileText size={16} />
            Documents
          </Link>
        </div>
      </nav>

      {/* Footer — Settings */}
      <div className="p-3 border-t border-[var(--border)]">
        <Link
          href="/settings"
          className={`flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm transition-colors ${
            pathname.startsWith('/settings')
              ? 'bg-[var(--gold)]/10 text-[var(--gold)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Settings size={16} />
          Settings
        </Link>
      </div>
    </aside>
  )
}
