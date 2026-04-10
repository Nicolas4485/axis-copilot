import type { Metadata } from 'next'
import { Playfair_Display, JetBrains_Mono } from 'next/font/google'
import { Providers } from '@/lib/providers'
import { AppShellClient } from '@/components/app-shell-client'
import './globals.css'

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
})

export const metadata: Metadata = {
  title: 'AXIS — AI Consulting Co-pilot',
  description: 'Agentic AI platform for consulting teams',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${playfair.variable} ${jetbrainsMono.variable}`}>
        <Providers>
          <AppShellClient>
            {children}
          </AppShellClient>
        </Providers>
      </body>
    </html>
  )
}
