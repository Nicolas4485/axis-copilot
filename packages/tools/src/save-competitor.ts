// save_competitor — Persist competitor profile to AgentMemory (SEMANTIC)
// Used by: CompetitiveAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'
import { PrismaClient } from '@prisma/client'

let _prisma: PrismaClient | null = null
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient()
  return _prisma
}

export interface SaveCompetitorInput {
  analysisId: string
  competitor: {
    name: string
    website?: string
    strengths: string[]
    weaknesses: string[]
    features: string[]
    positioning?: string
  }
}

export const saveCompetitorDefinition: ToolDefinition = {
  name: 'save_competitor',
  description: 'Store a competitor entry with strengths, weaknesses, features, and positioning. Links to an existing competitive analysis.',
  inputSchema: {
    type: 'object',
    properties: {
      analysisId: { type: 'string' },
      competitor: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          website: { type: 'string' },
          strengths: { type: 'array', items: { type: 'string' } },
          weaknesses: { type: 'array', items: { type: 'string' } },
          features: { type: 'array', items: { type: 'string' } },
          positioning: { type: 'string' },
        },
        required: ['name', 'strengths', 'weaknesses', 'features'],
      },
    },
    required: ['analysisId', 'competitor'],
  },
}

export async function saveCompetitor(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const analysisId = input['analysisId'] as string | undefined
  const competitor = input['competitor'] as Record<string, unknown> | undefined

  if (!analysisId || !competitor) {
    return { success: false, data: null, error: 'analysisId and competitor are required', durationMs: Date.now() - start }
  }

  const name = competitor['name'] as string

  try {
    const prisma = getPrisma()
    const memory = await prisma.agentMemory.create({
      data: {
        userId: context.userId,
        clientId: context.clientId ?? null,
        memoryType: 'SEMANTIC',
        content: JSON.stringify({ ...competitor, analysisId, analysisType: 'competitor' }),
        tags: ['competitor', name, context.sessionId],
      },
    })

    return {
      success: true,
      data: { id: memory.id, analysisId, name },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to save competitor: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
