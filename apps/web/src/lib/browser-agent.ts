/**
 * BrowserAgent — high-level browser automation primitives for the AXIS web app.
 *
 * Wraps ChromeExtensionBridge with multi-step recipes (visit, scrape, fill,
 * see, scrollToLoad, runPlan). Emits AGENT_PLAN_START/STEP/DONE/ERROR back
 * to the extension as it runs so the side panel's progress bar lights up.
 *
 * Two callers, same class:
 *   Phase A — user-triggered "Research" button in chat
 *   Phase B — server-side agent (Mel, Sean, …) requests browser work via
 *             SSE/WS callback; the web app receives the request and runs
 *             the same primitives on its behalf
 */

import {
  ChromeExtensionBridge,
  ExtensionUnavailableError,
  type BridgeReply,
  getExtensionBridge,
} from './chrome-extension-bridge'

export interface VisitOptions {
  background?: boolean
  waitFor?: string
  waitForMs?: number
  /** Optional plan-progress label shown in the side panel. */
  label?: string
}

export interface ScrapeResult {
  url: string
  title: string
  text: string
  headings: string[]
  wordCount: number
  truncated: boolean
}

export interface PlanStep<R = unknown> {
  /** Human-readable label for the side-panel progress bar. */
  label: string
  /** The actual work — receives the BrowserAgent so steps can chain. */
  run: (agent: BrowserAgent) => Promise<R>
}

export interface PlanResult<R = unknown> {
  results: R[]
  duration: number
  /** Set when a step threw. Earlier results are still returned. */
  error?: { step: number; label: string; message: string }
}

export class BrowserAgent {
  readonly bridge: ChromeExtensionBridge
  /**
   * Optional label that prefixes plan-progress messages. Useful when an
   * agent like Mel runs research — set this to "Mel" so the side panel
   * reads "Mel: opened LinkedIn" instead of just "opened LinkedIn".
   */
  readonly agentName: string | null

  constructor(bridge?: ChromeExtensionBridge | null, agentName: string | null = null) {
    const b = bridge ?? getExtensionBridge()
    if (!b) {
      throw new ExtensionUnavailableError(
        'NEXT_PUBLIC_AXIS_EXTENSION_ID is not set — see apps/web/.env.local.',
      )
    }
    this.bridge = b
    this.agentName = agentName
  }

  // ── High-level primitives ──────────────────────────────────────────────

  /**
   * Open a URL and read its main content. Returns the tab handle alongside
   * the page so callers can chain further commands. Tab stays open — call
   * `close(tabId)` or `scrape(...)` (which closes for you) when done.
   */
  async visit(url: string, options: VisitOptions = {}) {
    const tab = await unwrap(this.bridge.openTab({
      url,
      background: options.background ?? true,
      ...(options.waitFor !== undefined && { waitFor: options.waitFor }),
      ...(options.waitForMs !== undefined && { waitForMs: options.waitForMs }),
    }))
    const page = await unwrap(this.bridge.readPage({ tabId: tab.tabId }))
    return { tab, page }
  }

  /**
   * Open → read → close. The fire-and-forget primitive for one-shot research.
   */
  async scrape(url: string, options: VisitOptions = {}): Promise<ScrapeResult> {
    const { tab, page } = await this.visit(url, options)
    await this.bridge.closeTab({ tabId: tab.tabId }).catch(() => undefined)
    return {
      url: page.url,
      title: page.title,
      text: page.text,
      headings: page.headings,
      wordCount: page.wordCount,
      truncated: page.truncated,
    }
  }

  /** Type into an input. */
  async fill(tabId: number, selector: string, text: string, opts: { pressEnter?: boolean; clearFirst?: boolean } = {}) {
    return unwrap(this.bridge.fillInput({
      tabId,
      strategy: 'css',
      value: selector,
      text,
      clearFirst: opts.clearFirst ?? true,
      ...(opts.pressEnter !== undefined && { pressEnter: opts.pressEnter }),
    }))
  }

  /** Click an element by CSS selector and optionally wait for navigation. */
  async click(tabId: number, selector: string, opts: { waitForSelector?: string; expectNavigation?: boolean } = {}) {
    return unwrap(this.bridge.clickElement({
      tabId,
      strategy: 'css',
      value: selector,
      ...(opts.waitForSelector !== undefined && { waitForSelector: opts.waitForSelector }),
      ...(opts.expectNavigation !== undefined && { expectNavigation: opts.expectNavigation }),
    }))
  }

  /** Take a screenshot (full visible viewport, or scoped to a selector). */
  async see(tabId: number, selector?: string) {
    return unwrap(this.bridge.screenshot(selector ? { tabId, selector } : { tabId }))
  }

  /** Scroll to the bottom of an infinite-feed page, up to `maxScrolls` times. */
  async scrollToLoad(tabId: number, maxScrolls = 10, waitAfterMs = 800) {
    for (let i = 0; i < maxScrolls; i++) {
      const r = await unwrap(this.bridge.scroll({ tabId, direction: 'down', waitAfterMs }))
      if (r.atBottom) return { scrolledTimes: i + 1, atBottom: true }
    }
    return { scrolledTimes: maxScrolls, atBottom: false }
  }

  /** Wait for a CSS selector to appear (default 10s). */
  async waitForSelector(tabId: number, selector: string, timeoutMs = 10_000) {
    return unwrap(this.bridge.waitFor({ tabId, condition: 'selector', value: selector, timeoutMs }))
  }

  /** Close a tab the agent owns. */
  async close(tabId: number) {
    return this.bridge.closeTab({ tabId }).catch(() => undefined)
  }

  // ── Plan execution with progress reporting ─────────────────────────────

  /**
   * Run a sequence of steps. Emits AGENT_PLAN_* messages so the extension's
   * side panel shows progress. If a step throws, subsequent steps don't run
   * and the error is reported in the result.
   */
  async runPlan<R = unknown>(
    label: string,
    steps: PlanStep<R>[],
  ): Promise<PlanResult<R>> {
    const start = Date.now()
    const results: R[] = []
    const planLabel = this.agentName ? `${this.agentName}: ${label}` : label

    await this._emitProgress('AGENT_PLAN_START', { label: planLabel, total: steps.length })

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      if (!step) continue
      const stepLabel = this.agentName ? `${this.agentName}: ${step.label}` : step.label
      await this._emitProgress('AGENT_PLAN_STEP', { n: i + 1, label: stepLabel })
      try {
        const r = await step.run(this)
        results.push(r)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await this._emitProgress('AGENT_PLAN_ERROR', { error: message })
        return { results, duration: Date.now() - start, error: { step: i + 1, label: step.label, message } }
      }
    }

    await this._emitProgress('AGENT_PLAN_DONE', {})
    return { results, duration: Date.now() - start }
  }

  private async _emitProgress(command: string, payload: unknown) {
    // Best-effort — never let a progress emit failure break the actual plan.
    try {
      await this.bridge.send(command as never, payload)
    } catch {
      // Side panel might not be open; that's fine.
    }
  }
}

/** Throw on { success: false } replies, return the data on success. */
async function unwrap<T>(p: Promise<BridgeReply<T>>): Promise<T> {
  const reply = await p
  if (!reply.success) throw new Error(reply.error)
  return reply.data
}

/**
 * Convenience factory — gets the singleton bridge and wraps it.
 * Throws ExtensionUnavailableError if NEXT_PUBLIC_AXIS_EXTENSION_ID isn't set.
 */
export function getBrowserAgent(agentName: string | null = null): BrowserAgent {
  return new BrowserAgent(null, agentName)
}
