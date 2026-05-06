/**
 * Chrome extension bridge — typed transport from the AXIS web app to the
 * AXIS Chrome extension (axis-ext).
 *
 * Runs in browser only. Calls fail gracefully when:
 *   - the page is rendered server-side (no `chrome` global)
 *   - the user doesn't have the extension installed
 *   - the extension's externally_connectable doesn't include this origin
 *
 * Source of truth for command names + payload shapes:
 *   packages/types/src/extension-protocol.ts
 *
 * The web app calls into this bridge from Phase A (BrowserAgent class for
 * user-triggered research) and from Phase B (web-app-side handler when an
 * agent on the server requests browser work via SSE/WS).
 */

import {
  BrowserAgentMSG,
  ExtensionMSG,
  type BrowserAgentCommand,
} from '@axis/types'

export type BridgeReply<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string }

export interface BridgeOptions {
  /** Chrome extension ID — the unpacked ID shown on chrome://extensions. */
  extensionId: string
  /** Per-call timeout in ms. Default 30 000 (matches OPEN_TAB load timeout). */
  timeoutMs?: number
}

export class ExtensionUnavailableError extends Error {
  constructor(reason: string) {
    super(`Extension unavailable: ${reason}`)
    this.name = 'ExtensionUnavailableError'
  }
}

export class ExtensionTimeoutError extends Error {
  constructor(command: string, ms: number) {
    super(`Extension command "${command}" timed out after ${ms}ms`)
    this.name = 'ExtensionTimeoutError'
  }
}

/**
 * Detect whether `chrome.runtime.sendMessage` is callable from this context.
 * Server-side rendering, non-Chromium browsers, and missing-extension cases
 * all return false.
 */
export function isExtensionApiAvailable(): boolean {
  if (typeof globalThis === 'undefined') return false
  const c = (globalThis as { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome
  return typeof c?.runtime?.sendMessage === 'function'
}

/**
 * Low-level transport. Sends one message to the extension and resolves with
 * its reply. All higher-level methods (openTab, readPage, …) call through this.
 */
export async function sendToExtension<T = unknown>(
  extensionId: string,
  message: { command: string; payload?: unknown },
  timeoutMs = 30_000,
): Promise<BridgeReply<T>> {
  if (!isExtensionApiAvailable()) {
    throw new ExtensionUnavailableError(
      'chrome.runtime.sendMessage not available — open this page in Chromium with the AXIS extension installed.',
    )
  }
  const chromeApi = (globalThis as unknown as { chrome: typeof chrome }).chrome

  return new Promise<BridgeReply<T>>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ExtensionTimeoutError(message.command, timeoutMs))
    }, timeoutMs)

    try {
      chromeApi.runtime.sendMessage(extensionId, message, (reply: BridgeReply<T>) => {
        clearTimeout(timer)
        const lastError = chromeApi.runtime.lastError
        if (lastError) {
          reject(new ExtensionUnavailableError(lastError.message ?? 'unknown'))
          return
        }
        if (!reply) {
          reject(new ExtensionUnavailableError('no reply from extension'))
          return
        }
        resolve(reply)
      })
    } catch (err) {
      clearTimeout(timer)
      reject(err)
    }
  })
}

/**
 * Typed command surface — one method per Phase 2 BrowserAgentMSG plus the
 * Phase 1 commands an agent might also need (page context, status, memory).
 *
 * Throws ExtensionUnavailableError if the extension isn't reachable, or
 * ExtensionTimeoutError if a single call takes longer than `timeoutMs`.
 * Returns the raw BridgeReply so callers can branch on `success`.
 */
export class ChromeExtensionBridge {
  readonly extensionId: string
  readonly timeoutMs: number

  constructor(opts: BridgeOptions) {
    if (!opts.extensionId) {
      throw new Error('ChromeExtensionBridge: extensionId is required')
    }
    this.extensionId = opts.extensionId
    this.timeoutMs = opts.timeoutMs ?? 30_000
  }

  send<T = unknown>(command: BrowserAgentCommand | (typeof ExtensionMSG)[keyof typeof ExtensionMSG], payload?: unknown): Promise<BridgeReply<T>> {
    return sendToExtension<T>(this.extensionId, { command, payload }, this.timeoutMs)
  }

  // ── Phase 2 browser-agent commands ──────────────────────────────────────

  openTab(payload: { url: string; background?: boolean; waitFor?: string; waitForMs?: number }) {
    return this.send<{ tabId: number; url: string; title: string; loadTime: number }>(
      BrowserAgentMSG.OPEN_TAB, payload,
    )
  }

  closeTab(payload: { tabId: number }) {
    return this.send<{ closed: boolean }>(BrowserAgentMSG.CLOSE_TAB, payload)
  }

  getBrowserState() {
    return this.send<{
      activeTabs: Array<{ tabId: number; url: string; title: string; status: string; agentOwned: boolean }>
      activeTabId: number
      agentOwnedTabIds: number[]
      sessionCommands: number
    }>(BrowserAgentMSG.GET_BROWSER_STATE)
  }

  readPage(payload: {
    tabId?: number
    selector?: string
    includeLinks?: boolean
    includeTables?: boolean
    includeImages?: boolean
    maxChars?: number
  }) {
    return this.send<{
      url: string
      title: string
      text: string
      headings: string[]
      links?: Array<{ text: string; href: string }>
      tables?: unknown[][]
      images?: Array<{ alt: string; src: string }>
      wordCount: number
      truncated: boolean
      extractedAt: string
    }>(BrowserAgentMSG.READ_PAGE, payload)
  }

  findElement(payload: {
    tabId?: number
    strategy: 'css' | 'text' | 'aria' | 'xpath'
    value: string
    returnAll?: boolean
  }) {
    return this.send(BrowserAgentMSG.FIND_ELEMENT, payload)
  }

  clickElement(payload: {
    tabId?: number
    strategy: 'css' | 'text' | 'aria'
    value: string
    waitAfterMs?: number
    waitForSelector?: string
    expectNavigation?: boolean
  }) {
    return this.send<{ clicked: boolean; elementText: string; navigated: boolean; newUrl?: string }>(
      BrowserAgentMSG.CLICK_ELEMENT, payload,
    )
  }

  fillInput(payload: {
    tabId?: number
    strategy: 'css' | 'text' | 'aria' | 'placeholder'
    value: string
    text: string
    clearFirst?: boolean
    pressEnter?: boolean
    typeDelay?: number
  }) {
    return this.send<{ filled: boolean; finalValue: string }>(BrowserAgentMSG.FILL_INPUT, payload)
  }

  scroll(payload: {
    tabId?: number
    direction: 'down' | 'up' | 'to-bottom' | 'to-top' | 'to-element'
    amount?: number
    selector?: string
    waitAfterMs?: number
  }) {
    return this.send<{ scrollY: number; atBottom: boolean }>(BrowserAgentMSG.SCROLL, payload)
  }

  screenshot(payload: { tabId?: number; format?: 'png' | 'jpeg'; quality?: number; selector?: string } = {}) {
    return this.send<{ base64: string; mimeType: string; width: number; height: number }>(
      BrowserAgentMSG.SCREENSHOT, payload,
    )
  }

  waitFor(payload: {
    tabId?: number
    condition: 'selector' | 'text' | 'url-contains' | 'network-idle' | 'delay'
    value?: string
    timeoutMs?: number
    pollIntervalMs?: number
  }) {
    return this.send<{ met: boolean; waitedMs: number }>(BrowserAgentMSG.WAIT_FOR, payload)
  }

  cancelAgentPlan() {
    return this.send<{ cancelled: boolean }>(BrowserAgentMSG.CANCEL_AGENT_PLAN, {})
  }

  // ── Phase 1 commands (page context, status, memory) ─────────────────────

  getPageContext() {
    return this.send(ExtensionMSG.GET_PAGE_CONTEXT)
  }

  getExtensionStatus() {
    return this.send(ExtensionMSG.GET_EXTENSION_STATUS)
  }

  /**
   * Health check — call before relying on the extension. Returns true if
   * the extension is installed AND the agent-access toggle is on.
   */
  async isAvailable(): Promise<boolean> {
    if (!isExtensionApiAvailable()) return false
    try {
      const reply = await this.send(ExtensionMSG.GET_EXTENSION_STATUS)
      return reply.success === true
    } catch {
      return false
    }
  }
}

/**
 * Build a singleton bridge using the extension ID from
 * NEXT_PUBLIC_AXIS_EXTENSION_ID. Returns null if the env var isn't set —
 * caller should surface an error explaining how to configure it.
 */
let _instance: ChromeExtensionBridge | null = null
export function getExtensionBridge(): ChromeExtensionBridge | null {
  if (_instance) return _instance
  const id = process.env.NEXT_PUBLIC_AXIS_EXTENSION_ID
  if (!id) return null
  _instance = new ChromeExtensionBridge({ extensionId: id })
  return _instance
}
