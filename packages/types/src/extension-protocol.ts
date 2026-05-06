/**
 * AXIS extension ↔ copilot protocol — single source of truth.
 *
 * The extension (axis-ext) and the API/web (axis-copilot) both reference
 * these constants and types. The plain-JS extension imports the JSON snapshot
 * at axis-ext/utils/protocol-shared.json; the copilot side imports from this
 * module. Keep them in sync — see scripts/sync-extension-protocol.mjs (when
 * added) or update both manually.
 *
 * If you add a command, also update:
 *   - docs/EXTENSION-PROTOCOL.md
 *   - axis-ext/background/axis-bridge.js (handler)
 *   - axis-ext/utils/protocol-shared.json (mirror of the constants below)
 */

export const EXTENSION_PROTOCOL_VERSION = '1.0.0' as const

// ─── Direction 1: HTTP endpoints (extension → API) ───────────────────────────

export const EXTENSION_ENDPOINTS = {
  STATUS: '/api/extension/status',
  MEMORY: '/api/extension/memory',
  INSIGHT: '/api/extension/insight',
  CHAT: '/api/extension/chat',
} as const

export type ExtensionEndpoint = (typeof EXTENSION_ENDPOINTS)[keyof typeof EXTENSION_ENDPOINTS]

// ─── Direction 2: chrome.runtime.sendMessage commands (web → extension) ──────

export const ExtensionMSG = {
  GET_PAGE_CONTEXT: 'GET_PAGE_CONTEXT',
  GET_CHAT_HISTORY: 'GET_CHAT_HISTORY',
  INJECT_PROMPT: 'INJECT_PROMPT',
  TRIGGER_SUMMARY: 'TRIGGER_SUMMARY',
  SET_SYSTEM_CONTEXT: 'SET_SYSTEM_CONTEXT',
  GET_EXTENSION_STATUS: 'GET_EXTENSION_STATUS',
  SAVE_TO_MEMORY: 'SAVE_TO_MEMORY',
} as const

export type ExtensionCommand = (typeof ExtensionMSG)[keyof typeof ExtensionMSG]

// Internal messages (side panel ↔ service worker). Not part of the external
// contract, but kept here for completeness so the web app does not accidentally
// send these.
export const ExtensionInternalMSG = {
  CHAT: 'CHAT',
  PING_AXIS: 'PING_AXIS',
  OPEN_POPUP: 'OPEN_POPUP',
  STREAM_CHUNK: 'STREAM_CHUNK',
  STREAM_DONE: 'STREAM_DONE',
  STREAM_ERROR: 'STREAM_ERROR',
} as const

// ─── Phase 2: Browser Agent commands (reserved) ─────────────────────────────
// These are NOT yet implemented in axis-bridge.js. They are pre-declared here
// so the type system reserves the names and so the API/web side can begin
// referencing them as the extension lands them. Implementation tracked in
// AXIS_PE_SPEC and the Phase 2 spec.
//
// When you implement one in axis-bridge.js, move it from here into ExtensionMSG
// (or keep it here if it stays internal) and update docs/EXTENSION-PROTOCOL.md.

export const BrowserAgentMSG = {
  // Tab lifecycle
  OPEN_TAB: 'OPEN_TAB',
  CLOSE_TAB: 'CLOSE_TAB',
  GET_BROWSER_STATE: 'GET_BROWSER_STATE',
  // Reading
  READ_PAGE: 'READ_PAGE',
  FIND_ELEMENT: 'FIND_ELEMENT',
  SCREENSHOT: 'SCREENSHOT',
  // Interaction
  CLICK_ELEMENT: 'CLICK_ELEMENT',
  FILL_INPUT: 'FILL_INPUT',
  SCROLL: 'SCROLL',
  // Synchronisation
  WAIT_FOR: 'WAIT_FOR',
  // Control
  CANCEL_AGENT_PLAN: 'CANCEL_AGENT_PLAN',
} as const

export type BrowserAgentCommand = (typeof BrowserAgentMSG)[keyof typeof BrowserAgentMSG]

// ─── Shared payload shapes ──────────────────────────────────────────────────

export interface PageContext {
  url: string
  title: string
  text: string
  wordCount: number
  truncated?: boolean
}

export interface ExtensionStatusInfo {
  active: boolean
  tabUrl: string
  tabTitle: string
  hasContext: boolean
  memoryEnabled: boolean
  agentAccessEnabled: boolean
  axisBackendReachable: boolean
}

export interface MemoryEntry {
  source: 'axis-chrome-extension'
  agentTriggered?: boolean
  timestamp: string
  page?: { url: string; title: string; domain?: string }
  content: { summary?: string; rawText?: string }
  tags?: string[]
}

export interface InsightEntry {
  source: 'axis-chrome-extension'
  content: string
  tags?: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// ─── External-message envelope ──────────────────────────────────────────────

/** Shape of every message coming in via chrome.runtime.onMessageExternal. */
export interface ExternalMessage<C extends ExtensionCommand = ExtensionCommand, P = unknown> {
  command: C
  payload?: P
}

/** Shape of every reply sent via sendResponse. */
export type ExternalReply<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string }

// ─── HTTP response shapes ───────────────────────────────────────────────────

export interface ExtensionStatusResponse {
  ok: true
  version: string
  ready: boolean
  services: {
    db: 'ok' | 'error'
    redis: 'ok' | 'error'
  }
}

export interface ExtensionWriteResponse {
  ok: true
  id: string
}

export interface ExtensionErrorResponse {
  ok: false
  error: string
  code?: string
}

// ─── Command-payload mapping (for typed dispatch on either side) ────────────

export interface CommandPayloads {
  GET_PAGE_CONTEXT: undefined
  GET_CHAT_HISTORY: undefined
  INJECT_PROMPT: { prompt: string; autoSend?: boolean }
  TRIGGER_SUMMARY: { style?: 'brief' | 'detailed' | 'bullets' }
  SET_SYSTEM_CONTEXT: { context: string | null }
  GET_EXTENSION_STATUS: undefined
  SAVE_TO_MEMORY: { content: string; tags?: string[] }
}

export interface CommandResults {
  GET_PAGE_CONTEXT: PageContext | null
  GET_CHAT_HISTORY: ChatMessage[]
  INJECT_PROMPT: { injected: true }
  TRIGGER_SUMMARY: { summary: string; savedToMemory: boolean }
  SET_SYSTEM_CONTEXT: { applied: true }
  GET_EXTENSION_STATUS: ExtensionStatusInfo
  SAVE_TO_MEMORY: { id: string }
}
