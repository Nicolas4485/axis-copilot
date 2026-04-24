// save_analysis — Persist analysis to AgentMemory (SEMANTIC)
// Used by: ProductAgent, Aria (text + live mode)

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'
import { PrismaClient } from '@prisma/client'

let _prisma: PrismaClient | null = null
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient()
  return _prisma
}

export interface SaveAnalysisInput {
  sessionId: string
  type: 'PRODUCT_CRITIQUE' | 'PROCESS_ANALYSIS' | 'COMPETITIVE' | 'STAKEHOLDER_MAP'
  content: Record<string, unknown>
  summary?: string
}

export const saveAnalysisDefinition: ToolDefinition = {
  name: 'save_analysis',
  description: 'Save a structured analysis (product critique, process analysis, competitive analysis, or stakeholder map) to the database.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Session this analysis belongs to' },
      type: { type: 'string', enum: ['PRODUCT_CRITIQUE', 'PROCESS_ANALYSIS', 'COMPETITIVE', 'STAKEHOLDER_MAP'] },
      content: { type: 'object', description: 'Structured analysis content' },
      summary: { type: 'string', description: 'Brief summary of findings' },
      title: { type: 'string', description: 'Short title for this analysis' },
      clientId: { type: 'string', description: 'Client ID to associate with (optional)' },
      analysisType: { type: 'string', description: 'Type of analysis (e.g. "product", "process", "market")' },
    },
    required: [],
  },
}

export async function saveAnalysis(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()

  // Support both the old (sessionId/type/content object) and live-mode (title/content string) shapes
  const title = (input['title'] as string | undefined) ?? (input['type'] as string | undefined) ?? 'Analysis'
  const rawContent = input['content']
  const contentStr = typeof rawContent === 'string'
    ? rawContent
    : rawContent !== undefined
      ? JSON.stringify(rawContent)
      : (input['summary'] as string | undefined) ?? ''
  const analysisType = (input['analysisType'] as string | undefined) ?? (input['type'] as string | undefined) ?? 'general'
  const resolvedClientId = (input['clientId'] as string | undefined) ?? context.clientId ?? null

  if (!contentStr) {
    return { success: false, data: null, error: 'content is required', durationMs: Date.now() - start }
  }

  try {
    const prisma = getPrisma()
    const memory = await prisma.agentMemory.create({
      data: {
        userId: context.userId,
        clientId: resolvedClientId,
        memoryType: 'SEMANTIC',
        content: JSON.stringify({ title, analysisType, content: contentStr }),
        tags: ['analysis', analysisType, context.sessionId],
      },
    })

    return {
      success: true,
      data: { id: memory.id, title, analysisType, clientId: resolvedClientId },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to save analysis: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
