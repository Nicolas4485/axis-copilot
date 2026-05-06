'use client'

/**
 * Test/demo page for Phase A browser automation.
 *
 * Lets you smoke-test the BrowserAgent + ResearchPrompt + extension wiring
 * end-to-end without involving Aria or any specialist agent. Once the chat
 * integration is built (Phase B+), this page becomes a manual fallback.
 *
 * Setup checklist (one-time):
 *   1. Set NEXT_PUBLIC_AXIS_EXTENSION_ID in apps/web/.env.local
 *   2. Restart `pnpm --filter @axis/web dev`
 *   3. Open this page at /research
 */

import { useState } from 'react'
import { ResearchPrompt } from '@/components/research-prompt'
import type { ScrapeResult } from '@/lib/browser-agent'

export default function ResearchTestPage() {
  const [results, setResults] = useState<ScrapeResult[]>([])

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold text-[var(--text)] mb-1">Browser research (test)</h1>
      <p className="text-[13px] text-[var(--text-muted)] mb-6">
        Smoke-test the AXIS extension's autonomous browsing. Paste a URL, click Research,
        and watch the side panel show progress as a tab opens, the page is read, and the
        tab closes. The result appears below.
      </p>

      <ResearchPrompt
        agentName="Demo"
        onComplete={(r) => setResults((prev) => [r, ...prev])}
      />

      {results.length > 0 && (
        <div className="mt-6 space-y-4">
          <h2 className="text-[13px] font-medium text-[var(--text-muted)] uppercase tracking-wide">
            Results ({results.length})
          </h2>
          {results.map((r, i) => (
            <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="text-[13px] font-medium text-[var(--text)] mb-1">{r.title}</div>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-[var(--accent)] hover:underline break-all"
              >
                {r.url}
              </a>
              <div className="text-[11px] text-[var(--text-muted)] mt-2 mb-2">
                {r.wordCount ?? 0} words {r.truncated && '(truncated)'}
              </div>
              {(r.headings?.length ?? 0) > 0 && (
                <details className="mt-2">
                  <summary className="text-[12px] cursor-pointer text-[var(--text-muted)]">
                    Headings ({r.headings!.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-[12px] text-[var(--text)]">
                    {r.headings!.slice(0, 20).map((h, j) => (
                      <li key={j}>• {h}</li>
                    ))}
                  </ul>
                </details>
              )}
              <details className="mt-2">
                <summary className="text-[12px] cursor-pointer text-[var(--text-muted)]">
                  Page text (first 2000 chars)
                </summary>
                <pre className="mt-2 text-[11px] text-[var(--text)] whitespace-pre-wrap font-mono bg-[var(--bg)] p-3 rounded max-h-64 overflow-auto">
                  {(r.text ?? '').slice(0, 2000)}
                </pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
