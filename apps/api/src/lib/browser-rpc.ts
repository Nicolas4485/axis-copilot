/**
 * Browser RPC dispatcher — the high-level API for server-side agents to drive
 * the Chrome extension. Wraps the WS transport, runs results through the
 * security sanitizer, and consults the cross-domain gate before WRITE/SENSITIVE
 * actions.
 *
 * Tools defined in packages/agents/src/tools/browser-tools.ts call into this
 * module rather than the raw extension-ws-server. Keeps the security pipeline
 * centralized and impossible for individual tools to skip.
 *
 * Pipeline for every call:
 *   1. resolve capability class (READ_ONLY | WRITE | SENSITIVE)
 *   2. for WRITE/SENSITIVE: consult cross-domain-gate → may return a
 *      confirmation requirement back to the agent
 *   3. send the command via sendCommandToExtension (WS roundtrip)
 *   4. for READ-class results: sanitize + record provenance
 *   5. for action results: log the action with the resolved gate decision
 *   6. return the structured result to the tool, which returns it to the agent
 *
 * Audit: every call writes an AgentMemory row tagged 'browser-rpc' with the
 * tool name, target URL, capability, gate decision, and any sanitiser flags.
 */

import { sendCommandToExtension, isExtensionConnected, type ResponseMessage } from './extension-ws-server.js'
import { sanitizeToolResult, type SanitizeFlag } from './tool-result-sanitizer.js'
import { evaluateAction, recordProvenance, type CapabilityClass, type GateDecision } from './cross-domain-gate.js'
import { requestConfirmation } from './confirmation-bridge.js'
import { prisma } from './prisma.js'

// ─── Capability lookup table ──────────────────────────────────────────────
// Source of truth for which browser commands are READ_ONLY vs WRITE vs SENSITIVE.

const CAPABILITY_BY_COMMAND: Record<string, CapabilityClass> = {
  // Read-only — observe, don't change.
  GET_BROWSER_STATE: 'READ_ONLY',
  READ_PAGE:         'READ_ONLY',
  FIND_ELEMENT:      'READ_ONLY',
  SCREENSHOT:        'READ_ONLY',
  WAIT_FOR:          'READ_ONLY',
  // Write — produce side effects but bounded (open/close tabs, click, fill).
  OPEN_TAB:          'WRITE',
  CLOSE_TAB:         'WRITE',
  CLICK_ELEMENT:     'WRITE',
  FILL_INPUT:        'WRITE',
  SCROLL:            'WRITE',
  KEY_PRESS:         'WRITE',
  // Sensitive — irreversible or with potential downstream impact.
  // (Phase B+1: split CLICK_ELEMENT into CLICK + CLICK_SUBMIT and put SUBMIT here.)
  CANCEL_AGENT_PLAN: 'WRITE',
}

function capabilityFor(command: string): CapabilityClass {
  return CAPABILITY_BY_COMMAND[command] ?? 'SENSITIVE' // unknown → most restrictive
}

// ─── Result shape returned to tool callers ────────────────────────────────

export interface BrowserRpcResult<T = unknown> {
  /** True if the underlying command succeeded. */
  ok: boolean
  /** Raw data (for read commands, this is the unsanitized version). */
  data?: T
  /** For read commands, the sanitized text wrapped in <scraped_content> tags. */
  wrapped?: string
  /** Sanitiser flags raised during scanning. */
  flags?: SanitizeFlag[]
  /** Error message when ok=false. */
  error?: string
  /** Gate decision metadata (always present for WRITE/SENSITIVE calls). */
  gate?: GateDecision
  /** Whether user confirmation is required before the action runs. */
  requiresConfirmation?: boolean
}

export interface BrowserRpcCall {
  /** Prisma User id — looks up the right extension WS connection. */
  userId: string
  /** Optional logical session id — groups provenance and audit entries. */
  sessionId?: string
  /** Browser command name (one of the 12 declared in the extension protocol). */
  command: string
  /** Command-specific payload. Validated on the extension side, not here. */
  payload?: Record<string, unknown>
  /** The agent making the call (Mel, Sean, Aria, etc.). For audit logging. */
  agentName?: string
  /** Optional URL the user is currently on — used by the cross-domain gate. */
  currentTabUrl?: string
  /** Per-call timeout. Default 30 s; bump for slow commands. */
  timeoutMs?: number
}

// ─── Main dispatcher ──────────────────────────────────────────────────────

export async function callBrowserCommand(call: BrowserRpcCall): Promise<BrowserRpcResult> {
  const sessionId = call.sessionId ?? `user:${call.userId}`
  const capability = capabilityFor(call.command)

  if (!isExtensionConnected(call.userId)) {
    return {
      ok: false,
      error: 'Extension not connected. Surface a "Connect AXIS extension" prompt to the user.',
    }
  }

  // Cross-domain gate (only for WRITE / SENSITIVE commands).
  let gateDecision: GateDecision | undefined
  if (capability !== 'READ_ONLY') {
    const targetUrl = typeof call.payload?.['url'] === 'string'
      ? (call.payload['url'] as string)
      : (call.currentTabUrl ?? '')
    gateDecision = evaluateAction({
      sessionId,
      command: call.command,
      capability,
      targetUrl,
      ...(call.currentTabUrl !== undefined && { currentTabUrl: call.currentTabUrl }),
    })

    if (gateDecision.action === 'deny') {
      await audit({ ...call, capability, gate: gateDecision, ok: false, error: 'Denied by cross-domain gate' })
      return { ok: false, error: gateDecision.reason, gate: gateDecision }
    }

    if (gateDecision.action === 'require_confirmation') {
      // Pause and ask the user. The confirmation-bridge fires a
      // tool_confirmation SSE event over the active aria SSE stream
      // (registered by routes/aria.ts at request start) and awaits the
      // user's Approve/Deny. Times out after 5 minutes → deny.
      const decision = await requestConfirmation({
        sessionId,
        command: call.command,
        payload: call.payload ?? {},
        gate: gateDecision,
      })

      if (decision === 'deny') {
        await audit({ ...call, capability, gate: gateDecision, ok: false, error: 'User denied confirmation' })
        return {
          ok: false,
          gate: gateDecision,
          requiresConfirmation: true,
          error: 'The user declined to approve this action.',
        }
      }
      // decision === 'approve' → fall through and execute the command.
      // We deliberately do NOT re-evaluate the gate here: the user already
      // saw the same gate message and approved, so re-checking would just
      // ask again forever. Audit records the approval explicitly.
      await audit({ ...call, capability, gate: gateDecision, ok: true, error: 'User approved (proceeding)' })
    }
  }

  // Send the command.
  let response: ResponseMessage
  try {
    response = await sendCommandToExtension(call.userId, call.command, call.payload ?? {}, call.timeoutMs)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await audit({ ...call, capability, gate: gateDecision, ok: false, error })
    return { ok: false, error, ...(gateDecision !== undefined && { gate: gateDecision }) }
  }

  if (!response.success) {
    await audit({ ...call, capability, gate: gateDecision, ok: false, error: response.error ?? 'unknown' })
    return {
      ok: false,
      error: response.error ?? 'unknown',
      ...(gateDecision !== undefined && { gate: gateDecision }),
    }
  }

  // Sanitize for read commands (where the result is content the LLM will read).
  if (capability === 'READ_ONLY' && (call.command === 'READ_PAGE' || call.command === 'GET_BROWSER_STATE')) {
    const data = response.data as { url?: string; text?: string; title?: string } | undefined
    if (data?.text) {
      const safe = sanitizeToolResult({
        command: call.command,
        url: data.url ?? '',
        content: data.text,
        ...(data.title !== undefined && { title: data.title }),
      })
      recordProvenance(sessionId, { domain: safe.domain, command: call.command })
      await audit({ ...call, capability, gate: gateDecision, ok: true, flags: safe.flags })
      return { ok: true, data: response.data, wrapped: safe.wrapped, flags: safe.flags }
    }
  }

  await audit({ ...call, capability, gate: gateDecision, ok: true })
  return {
    ok: true,
    data: response.data,
    ...(gateDecision !== undefined && { gate: gateDecision }),
  }
}

// ─── Audit logging ────────────────────────────────────────────────────────

interface AuditEntry extends BrowserRpcCall {
  capability: CapabilityClass
  gate: GateDecision | undefined
  ok: boolean
  error?: string
  flags?: SanitizeFlag[]
}

async function audit(entry: AuditEntry): Promise<void> {
  try {
    const tags: string[] = ['browser-rpc', entry.command, entry.capability.toLowerCase()]
    if (entry.agentName) tags.push(`agent:${entry.agentName}`)
    if (entry.gate) tags.push(`gate:${entry.gate.action}`)
    if (entry.flags && entry.flags.length > 0) tags.push('sanitizer-flagged')
    if (!entry.ok) tags.push('failed')

    const summary = JSON.stringify({
      command: entry.command,
      capability: entry.capability,
      ok: entry.ok,
      ...(entry.error !== undefined && { error: entry.error }),
      ...(entry.gate !== undefined && { gate: { action: entry.gate.action, reason: entry.gate.reason } }),
      ...(entry.flags && entry.flags.length > 0 && { flagCount: entry.flags.length }),
      payloadKeys: Object.keys(entry.payload ?? {}),
    })

    await prisma.agentMemory.create({
      data: {
        userId: entry.userId,
        memoryType: 'PROCEDURAL',
        content: summary,
        tags,
      },
    })
  } catch (err) {
    // Audit failures should never break the actual command flow.
    // eslint-disable-next-line no-console
    console.error('[browser-rpc] audit write failed:', err instanceof Error ? err.message : String(err))
  }
}
