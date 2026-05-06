// store_correction — Persist a user correction or style preference as PROCEDURAL memory
// Called by Aria when Nicolas asks to change how an agent formats or writes future outputs

import type { PrismaClient } from '@prisma/client'
import type { ToolContext, ToolDefinition, ToolResult } from './types.js'

const VALID_AGENT_KEYS = [
  'AGENT_ARIA',
  'AGENT_DUE_DILIGENCE',
  'AGENT_PRODUCT',
  'AGENT_COMPETITIVE',
  'AGENT_PROCESS',
  'AGENT_STAKEHOLDER',
] as const

type AgentKey = typeof VALID_AGENT_KEYS[number]

// Module-level singleton — avoids opening a new connection on every call
let prismaInstance: PrismaClient | null = null

async function getPrisma(): Promise<PrismaClient> {
  if (!prismaInstance) {
    const { PrismaClient } = await import('@prisma/client')
    prismaInstance = new PrismaClient()
  }
  return prismaInstance
}

export const storeCorrectionDefinition: ToolDefinition = {
  name: 'store_correction',
  description: `Persist a correction or style preference as a permanent rule. The rule is injected into every future run of that agent automatically — it will not be forgotten after this session.

Call this when Nicolas says things like:
- "From now on, always do X in [agent] outputs"
- "I'd like to change how [agent] formats Y"
- "Never do X again in [output type]"
- "Next time [agent] writes Z, it should look like this instead"

Fill instruction with the specific rule. If Nicolas showed or quoted the wrong version and the corrected version, include both as originalText and correctedText.`,
  inputSchema: {
    type: 'object',
    properties: {
      agentKey: {
        type: 'string',
        enum: VALID_AGENT_KEYS,
        description: 'Which agent this correction applies to. Use AGENT_ARIA for Aria herself, AGENT_DUE_DILIGENCE for Alex, AGENT_PRODUCT for Sean, AGENT_COMPETITIVE for Mel, AGENT_PROCESS for Kevin, AGENT_STAKEHOLDER for Anjie.',
      },
      outputType: {
        type: 'string',
        description: 'What type of output this rule applies to. Examples: cim_analysis, memo_section, email, chat_response, dd_report, executive_summary, lbo_analysis.',
      },
      outputRef: {
        type: 'string',
        description: 'Optional: the specific section or sub-type within that output (e.g. "executive_summary" within "memo_section").',
      },
      instruction: {
        type: 'string',
        description: 'The rule to store. Be specific and actionable — vague rules are harder for agents to apply. Example: "Use bullet points with max 8 words each. Never write multi-sentence bullets."',
      },
      originalText: {
        type: 'string',
        description: 'Optional: the original output that was wrong, if available from the current conversation.',
      },
      correctedText: {
        type: 'string',
        description: 'Optional: the corrected version Nicolas provided.',
      },
    },
    required: ['agentKey', 'outputType', 'instruction'],
  },
}

export async function storeCorrection(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()

  const agentKey = input['agentKey'] as AgentKey | undefined
  const outputType = input['outputType'] as string | undefined
  const outputRef = input['outputRef'] as string | undefined
  const instruction = input['instruction'] as string | undefined
  const originalText = input['originalText'] as string | undefined
  const correctedText = input['correctedText'] as string | undefined

  if (!agentKey || !(VALID_AGENT_KEYS as ReadonlyArray<string>).includes(agentKey)) {
    return { success: false, data: null, error: 'Invalid agentKey', durationMs: Date.now() - start }
  }
  if (!outputType || !outputType.trim()) {
    return { success: false, data: null, error: 'outputType is required', durationMs: Date.now() - start }
  }
  if (!instruction || !instruction.trim()) {
    return { success: false, data: null, error: 'instruction is required', durationMs: Date.now() - start }
  }

  const ref = outputRef ? `/${outputRef}` : ''
  const hasExample = originalText && correctedText

  const content = hasExample
    ? `USER CORRECTION [${agentKey}/${outputType}${ref}]:
Nicolas reviewed an output and made the following correction. Apply this preference in all future outputs of this type.

ORIGINAL (do not replicate):
${originalText.slice(0, 800)}

CORRECTED (Nicolas's preferred version):
${correctedText.slice(0, 800)}

RULE: ${instruction}

When generating ${outputType} outputs${outputRef ? ` (section: ${outputRef})` : ''}, follow the corrected version's style, structure, and tone.`
    : `USER PREFERENCE [${agentKey}/${outputType}${ref}]:
Nicolas has set the following preference. Apply this to all future outputs of this type.

RULE: ${instruction}

When generating ${outputType} outputs${outputRef ? ` (section: ${outputRef})` : ''}, always follow this rule.`

  try {
    const db = await getPrisma()
    await db.agentMemory.create({
      data: {
        userId: context.userId,
        clientId: null, // cross-client — applies to all deals
        memoryType: 'PROCEDURAL',
        content,
        tags: [agentKey, outputType, 'user_correction'],
      },
    })

    return {
      success: true,
      data: {
        agentKey,
        outputType,
        outputRef: outputRef ?? null,
        instruction,
        message: `Stored. I'll apply "${instruction}" to all future ${outputType} outputs${outputRef ? ` (${outputRef})` : ''}.`,
      },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to store correction: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
