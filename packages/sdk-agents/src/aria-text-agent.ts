// AriaTextAgent — SDK-backed text-mode Aria.
// Replaces the Gemini/InferenceEngine loop in aria.ts when SDK_AGENTS_ENABLED=true.
// Live (voice/video) sessions are NEVER touched — they stay on Gemini Live in aria-live-ws.ts.

import { query } from '@anthropic-ai/claude-agent-sdk'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { ToolContext } from '@axis/tools'
import { ARIA_PERSONALITY } from '@axis/agents'
import { buildMcpBridge } from './mcp-tool-bridge.js'
import { buildSpecialistDefinitions } from './specialist-definitions.js'
import { SdkSessionStore } from './session-store.js'
import { allToolsSlice } from './tool-slices.js'

// In SDK mode, sub-agents are invoked via the Task tool (SDK name: 'Task').
// This addendum overrides the delegation tool instructions from ARIA_PERSONALITY
// so Aria uses Task(subagent_type=X) instead of the non-existent delegate_* tools.
const SDK_DELEGATION_ADDENDUM = `

## SDK Agent Mode — Specialist Delegation
In this session, your four specialists are available as sub-agents via the Task tool.
Invoke them using EXACTLY these subagent_type values:
- Mel (competitive):  Task(subagent_type="mel-competitive",  prompt="<full query with all context>")
- Sean (product):     Task(subagent_type="sean-product",     prompt="<full query with all context>")
- Kevin (process):    Task(subagent_type="kevin-process",    prompt="<full query with all context>")
- Anjie (stakeholder): Task(subagent_type="anjie-stakeholder", prompt="<full query with all context>")

IMPORTANT: Include the actual source data (email content, document extracts, client context)
in the prompt — not a description of it. Specialists only see what you pass them.
Do NOT call delegate_competitive_analysis, delegate_product_analysis,
delegate_process_analysis, or delegate_stakeholder_analysis — those tools do not exist
in SDK mode. All other rules from your base instructions apply unchanged.
`

const SDK_SYSTEM_PROMPT = ARIA_PERSONALITY + SDK_DELEGATION_ADDENDUM

const MCP_SERVER_NAME = 'axis-tools'

export interface AriaTextResult {
  content: string
  sessionId: string | undefined
  totalCostUsd: number
}

export class AriaTextAgent {
  private readonly sessionStore = new SdkSessionStore()

  async handleMessage(
    userMessage: string,
    ariaSessionId: string,
    context: ToolContext,
    onToken: (token: string) => void
  ): Promise<AriaTextResult> {
    const existingSession = this.sessionStore.get(ariaSessionId)
    const bridge = buildMcpBridge(allToolsSlice, context, MCP_SERVER_NAME)
    const mcpToolNames = allToolsSlice.map(
      (e) => `mcp__${MCP_SERVER_NAME}__${e.definition.name}`
    )

    let sessionId: string | undefined
    let totalCostUsd = 0
    const contentParts: string[] = []

    const options = {
      systemPrompt: SDK_SYSTEM_PROMPT,
      mcpServers: { [MCP_SERVER_NAME]: bridge } as Record<string, typeof bridge>,
      agents: buildSpecialistDefinitions(),
      tools: [] as string[],
      allowedTools: ['Task', ...mcpToolNames],
      model: 'claude-sonnet-4-6',
      maxTurns: 20,
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      persistSession: true,
      ...(existingSession ? { resume: existingSession } : {}),
    }

    for await (const msg of query({ prompt: userMessage, options })) {
      const m = msg as SDKMessage
      if (m.type === 'system' && m.subtype === 'init' && !sessionId) {
        sessionId = m.session_id
        this.sessionStore.set(ariaSessionId, m.session_id)
      } else if (m.type === 'assistant') {
        const text = extractTextContent(m.message.content)
        if (text) {
          contentParts.push(text)
          onToken(text)
        }
      } else if (m.type === 'result') {
        totalCostUsd = m.total_cost_usd
      }
    }

    return {
      content: contentParts.join(''),
      sessionId,
      totalCostUsd,
    }
  }

  clearSession(ariaSessionId: string): void {
    this.sessionStore.clear(ariaSessionId)
  }
}

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .filter(
      (b): b is { type: 'text'; text: string } =>
        typeof b === 'object' &&
        b !== null &&
        (b as Record<string, unknown>)['type'] === 'text' &&
        typeof (b as Record<string, unknown>)['text'] === 'string'
    )
    .map((b) => b.text)
    .join('')
}
