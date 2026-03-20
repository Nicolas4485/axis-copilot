'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, MessageSquare, Users, Settings } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '#sessions', label: 'Sessions', icon: MessageSquare },
  { href: '#clients', label: 'Clients', icon: Users },
] as const

export function Sidebar() {
  const pathname = usePathname()

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
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href.replace('#', '/')))
          return (
            <Link
              key={item.href}
              href={item.href === '#sessions' ? '/' : item.href === '#clients' ? '/' : item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-[var(--gold)]/10 text-[var(--gold)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[var(--border)]">
        <button className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors">
          <Settings size={18} />
          Settings
        </button>
      </div>
    </aside>
  )
}
