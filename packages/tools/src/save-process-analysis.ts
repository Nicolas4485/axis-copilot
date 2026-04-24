// save_process_analysis — Persist process analysis to AgentMemory (SEMANTIC)
// Used by: ProcessAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'
import { PrismaClient } from '@prisma/client'

let _prisma: PrismaClient | null = null
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient()
  return _prisma
}

export interface SaveProcessAnalysisInput {
  sessionId: string
  analysis: {
    summary: string
    steps: Array<{
      stepName: string
      automationScore: number
      agentType?: string
      humanCheckpoint: boolean
      humanCheckpointReason?: string
      order: number
    }>
  }
}

export const saveProcessAnalysisDefinition: ToolDefinition = {
  name: 'save_process_analysis',
  description: 'Save a process analysis with individual steps, automation scores, and human checkpoint requirements.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      analysis: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                stepName: { type: 'string' },
                automationScore: { type: 'number', description: '0-100 automation feasibility' },
                agentType: { type: 'string' },
                humanCheckpoint: { type: 'boolean' },
                humanCheckpointReason: { type: 'string' },
                order: { type: 'number' },
              },
              required: ['stepName', 'automationScore', 'humanCheckpoint', 'order'],
            },
          },
        },
        required: ['summary', 'steps'],
      },
    },
    required: ['sessionId', 'analysis'],
  },
}

export async function saveProcessAnalysis(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const analysis = input['analysis'] as Record<string, unknown> | undefined

  if (!analysis) {
    return { success: false, data: null, error: 'analysis is required', durationMs: Date.now() - start }
  }

  const summary = (analysis['summary'] as string | undefined) ?? ''
  const steps = (analysis['steps'] as Array<Record<string, unknown>> | undefined) ?? []

  try {
    const prisma = getPrisma()
    const memory = await prisma.agentMemory.create({
      data: {
        userId: context.userId,
        clientId: context.clientId ?? null,
        memoryType: 'SEMANTIC',
        content: JSON.stringify({ summary, steps, analysisType: 'process_analysis' }),
        tags: ['analysis', 'process_analysis', context.sessionId],
      },
    })

    return {
      success: true,
      data: { id: memory.id, summary, stepCount: steps.length },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to save process analysis: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
