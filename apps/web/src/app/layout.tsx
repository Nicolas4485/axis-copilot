import type { Metadata } from 'next'
import { Inter, Inter_Tight, Plus_Jakarta_Sans, Playfair_Display, JetBrains_Mono } from 'next/font/google'
import { Providers } from '@/lib/providers'
import { AppShellClient } from '@/components/app-shell-client'
import './globals.css'

// Inter — UI chrome: nav, labels, badges, settings
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

// Plus Jakarta Sans — chat messages and prose content (friendlier, rounder)
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600'],
})

// Playfair Display — editorial serif for headings
const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
})

// Inter Tight — compact display headings (design handoff)
const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  weight: ['600', '700'],
})

// JetBrains Mono — AXIS wordmark, timestamps, cost figures, technical labels
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
})

export const metadata: Metadata = {
  title: 'AXIS — AI Consulting Co-pilot',
  description: 'Agentic AI platform for consulting teams',
}

// Pre-paint theme script — runs synchronously in <head> before React hydrates.
// Reads localStorage and system preference, sets data-theme on <html> so the
// correct palette is applied on the very first paint (no flash of wrong theme).
const themeInitScript = `(function(){try{var t=localStorage.getItem('axis-theme');if(!t){t=window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning className={`${inter.variable} ${interTight.variable} ${jakarta.variable} ${playfair.variable} ${jetbrainsMono.variable}`}>
        <Providers>
          <AppShellClient>
            {children}
          </AppShellClient>
        </Providers>
      </body>
    </html>
  )
}
