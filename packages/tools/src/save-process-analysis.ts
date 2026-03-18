// save_process_analysis — Create Analysis + ProcessStep records
// Used by: ProcessAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

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
  const sessionId = (input['sessionId'] as string | undefined) ?? context.sessionId
  const analysis = input['analysis'] as Record<string, unknown> | undefined

  if (!analysis) {
    return { success: false, data: null, error: 'analysis is required', durationMs: Date.now() - start }
  }

  const summary = analysis['summary'] as string ?? ''
  const steps = analysis['steps'] as Array<Record<string, unknown>> ?? []

  try {
    // TODO: Create Analysis + ProcessStep records via Prisma
    // const record = await prisma.analysis.create({
    //   data: {
    //     sessionId, clientId: context.clientId,
    //     type: 'PROCESS_ANALYSIS', content: analysis, summary,
    //   },
    // })
    // for (const step of steps) {
    //   await prisma.processStep.create({
    //     data: { analysisId: record.id, ...step },
    //   })
    // }

    const analysisId = `ana_${Date.now()}`

    return {
      success: true,
      data: { id: analysisId, sessionId, summary, stepCount: steps.length },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to save process analysis: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
