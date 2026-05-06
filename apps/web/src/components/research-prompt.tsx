'use client'

/**
 * ResearchPrompt — chat-inline affordance for browser-driven research.
 *
 * Two modes:
 *   1. With a `url` prop: shows a "Research with Browser" button that opens
 *      that URL via the AXIS extension, scrapes it, and returns the result.
 *   2. Without a URL: shows a free-form input where the user pastes a URL.
 *
 * Failure paths:
 *   - Extension not installed → shows install instructions
 *   - Agent access disabled → shows a link to extension settings
 *   - Network/timeout → shows the error and a Retry button
 *
 * Uses BrowserAgent under the hood. The same component is used by Phase A
 * (user-triggered from a "I need to research X" message) and by Phase B
 * (agent-surfaced when an autonomous agent needs browser access mid-task).
 */

import { useCallback, useState } from 'react'
import { Globe, Loader2, AlertTriangle, ExternalLink, CheckCircle2 } from 'lucide-react'
import { BrowserAgent, type ScrapeResult } from '@/lib/browser-agent'
import { ExtensionUnavailableError, isExtensionApiAvailable, getExtensionBridge } from '@/lib/chrome-extension-bridge'

interface ResearchPromptProps {
  /** Pre-filled URL. If absent, shows a URL input. */
  url?: string
  /** Optional pre-set agent label that prefixes the side-panel progress bar. */
  agentName?: string
  /** Called when the scrape succeeds. Use this to stream the result back into chat. */
  onComplete: (result: ScrapeResult) => void
  /** Optional cancel — caller can dismiss the affordance from chat. */
  onDismiss?: () => void
}

type Status =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; result: ScrapeResult }
  | { kind: 'error'; message: string; helpLink?: { label: string; href: string } }

export function ResearchPrompt({ url, agentName, onComplete, onDismiss }: ResearchPromptProps) {
  const [targetUrl, setTargetUrl] = useState(url ?? '')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const onResearch = useCallback(async () => {
    const trimmed = targetUrl.trim()
    if (!trimmed) {
      setStatus({ kind: 'error', message: 'Enter a URL first.' })
      return
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      setStatus({ kind: 'error', message: 'URL must start with http:// or https://' })
      return
    }
    if (!isExtensionApiAvailable()) {
      setStatus({
        kind: 'error',
        message: 'AXIS extension is not installed in this browser.',
        helpLink: { label: 'Install instructions', href: 'chrome://extensions' },
      })
      return
    }
    if (!getExtensionBridge()) {
      setStatus({
        kind: 'error',
        message: 'Extension ID is not configured. Set NEXT_PUBLIC_AXIS_EXTENSION_ID in apps/web/.env.local.',
      })
      return
    }

    setStatus({ kind: 'running' })
    try {
      const agent = new BrowserAgent(null, agentName ?? null)
      const ok = await agent.bridge.isAvailable()
      if (!ok) {
        setStatus({
          kind: 'error',
          message: 'Extension is installed but agent access is disabled.',
          helpLink: { label: 'Open extension settings', href: 'chrome://extensions' },
        })
        return
      }
      const result = await agent.scrape(trimmed)
      setStatus({ kind: 'done', result })
      onComplete(result)
    } catch (err) {
      const message =
        err instanceof ExtensionUnavailableError ? err.message :
        err instanceof Error ? err.message :
        String(err)
      setStatus({ kind: 'error', message })
    }
  }, [targetUrl, agentName, onComplete])

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 my-2">
      <div className="flex items-center gap-2 text-[13px] text-[var(--text)] mb-2">
        <Globe className="w-4 h-4 text-[var(--accent)]" />
        <span className="font-medium">Browser research</span>
        {onDismiss && status.kind !== 'running' && (
          <button
            type="button"
            onClick={onDismiss}
            className="ml-auto text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Dismiss
          </button>
        )}
      </div>

      {!url && (
        <input
          type="url"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="https://example.com/competitor"
          disabled={status.kind === 'running'}
          className="w-full px-2 py-1.5 mb-2 text-[12px] bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
      )}

      {url && (
        <div className="text-[12px] text-[var(--text-muted)] mb-2 truncate">
          <span className="text-[var(--text)]">URL:</span> {url}
        </div>
      )}

      {status.kind === 'idle' && (
        <button
          type="button"
          onClick={onResearch}
          className="px-3 py-1.5 text-[12px] font-medium rounded-full bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
        >
          Research with browser
        </button>
      )}

      {status.kind === 'running' && (
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Opening tab and reading page…</span>
        </div>
      )}

      {status.kind === 'done' && (
        <div className="flex items-center gap-2 text-[12px] text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          <span>
            Scraped {status.result.wordCount} words from “{status.result.title}”
          </span>
        </div>
      )}

      {status.kind === 'error' && (
        <div className="flex items-start gap-2 text-[12px] text-red-400">
          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div>{status.message}</div>
            {status.helpLink && (
              <a
                href={status.helpLink.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-[var(--accent)] hover:underline"
              >
                {status.helpLink.label}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              type="button"
              onClick={() => setStatus({ kind: 'idle' })}
              className="ml-2 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
