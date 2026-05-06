/**
 * Confirmation bridge — pauses tool execution while the user approves or
 * denies a gate-flagged action, then resumes via a separate POST.
 *
 * Mirrors the pendingClarifications pattern in routes/sessions.ts: a
 * module-level Map holds resolvers keyed by requestId. The SSE route
 * registers a per-session emit callback at request start and unregisters
 * at request end. browser-rpc.ts calls requestConfirmation() when the
 * cross-domain gate flags an action; that emits a tool_confirmation SSE
 * event and awaits the user's decision. The POST /api/aria/tool-confirmation
 * endpoint resolves the matching entry.
 *
 * Lifecycle:
 *   1. SSE request starts → registerSessionEmit(sessionId, fn)
 *   2. Agent calls a gated tool → browser-rpc calls requestConfirmation()
 *      → bridge fires the SSE event via the registered emit fn
 *      → bridge awaits the resolver
 *   3. User clicks Approve/Deny in chat → POST → resolveConfirmation()
 *      → pending Promise resolves → browser-rpc proceeds (or aborts)
 *   4. SSE request ends → unregisterSessionEmit(sessionId)
 *
 * Failure modes handled:
 *   - SSE channel closed mid-confirmation: timeout (default 5 min) → 'deny'
 *   - No emit fn registered for sessionId: instant 'deny' (we never want
 *     a gated action to silently proceed without the user seeing it)
 *   - Stale resolveConfirmation calls (request already timed out): noop
 */

import { randomUUID } from 'crypto'
import type { GateDecision } from './cross-domain-gate.js'

// ─── Public types ─────────────────────────────────────────────────────────

export type ConfirmationDecision = 'approve' | 'deny'

export interface ConfirmationEvent {
  /** Unique id the client uses when POSTing the decision back. */
  requestId: string
  /** Tool the agent was attempting. */
  command: string
  /** Sanitized excerpt of the payload (URL only — full payload may contain text). */
  targetUrl: string
  /** Gate's verdict + reason. */
  gate: GateDecision
  /** Human-readable message rendered to the user. */
  userMessage: string
}

export type EmitFn = (event: ConfirmationEvent) => void

// ─── Internal state ───────────────────────────────────────────────────────

interface PendingEntry {
  resolve: (decision: ConfirmationDecision) => void
  /** Used to invalidate the timeout when the entry is resolved early. */
  timer: NodeJS.Timeout
  sessionId: string
}

const pending = new Map<string, PendingEntry>()
const sessionEmit = new Map<string, EmitFn>()

const DEFAULT_TIMEOUT_MS = 5 * 60_000

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Register the SSE emit callback for a session. Call from the route handler
 * right after SSE setup. Pair with unregisterSessionEmit on request close.
 */
export function registerSessionEmit(sessionId: string, emit: EmitFn): void {
  sessionEmit.set(sessionId, emit)
}

/**
 * Remove the SSE callback. Any pending confirmations for this session are
 * resolved with 'deny' to avoid hanging the agent's tool loop.
 */
export function unregisterSessionEmit(sessionId: string): void {
  sessionEmit.delete(sessionId)
  for (const [requestId, entry] of pending) {
    if (entry.sessionId === sessionId) {
      pending.delete(requestId)
      clearTimeout(entry.timer)
      entry.resolve('deny')
    }
  }
}

/**
 * Ask the user to approve or deny a gated action. Resolves with their
 * decision, or 'deny' on timeout / no SSE channel.
 *
 * Called by browser-rpc.ts when GateDecision.action === 'require_confirmation'.
 */
export function requestConfirmation(args: {
  sessionId: string
  command: string
  payload: unknown
  gate: GateDecision
  /** Override the default 5-minute timeout. */
  timeoutMs?: number
}): Promise<ConfirmationDecision> {
  const emit = sessionEmit.get(args.sessionId)
  if (!emit) {
    // No SSE channel for this session — fail closed.
    return Promise.resolve('deny')
  }
  if (args.gate.action !== 'require_confirmation') {
    // Defensive: don't open a confirmation for a non-confirm decision.
    return Promise.resolve(args.gate.action === 'allow' ? 'approve' : 'deny')
  }

  const requestId = randomUUID()
  const targetUrl = extractTargetUrl(args.payload)

  return new Promise<ConfirmationDecision>((resolve) => {
    const timer = setTimeout(() => {
      if (pending.delete(requestId)) {
        resolve('deny')
      }
    }, args.timeoutMs ?? DEFAULT_TIMEOUT_MS)

    pending.set(requestId, { resolve, timer, sessionId: args.sessionId })

    try {
      emit({
        requestId,
        command: args.command,
        targetUrl,
        gate: args.gate,
        userMessage: args.gate.userMessage,
      })
    } catch {
      // emit failed (channel closed mid-flight) → resolve deny.
      pending.delete(requestId)
      clearTimeout(timer)
      resolve('deny')
    }
  })
}

/**
 * Resolve a pending confirmation with the user's decision. Called by the
 * POST /api/aria/tool-confirmation route handler.
 *
 * Returns true on success. Returns false if the requestId is unknown
 * (already resolved, timed out, or never existed).
 */
export function resolveConfirmation(
  requestId: string,
  decision: ConfirmationDecision,
): boolean {
  const entry = pending.get(requestId)
  if (!entry) return false
  pending.delete(requestId)
  clearTimeout(entry.timer)
  entry.resolve(decision)
  return true
}

/**
 * Diagnostic helper for the /admin/audit page or tests.
 * Returns the count of currently-pending confirmations.
 */
export function _pendingCountForTest(): number {
  return pending.size
}

// ─── Internal helpers ─────────────────────────────────────────────────────

function extractTargetUrl(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const url = (payload as Record<string, unknown>)['url']
    if (typeof url === 'string') return url
  }
  return ''
}
