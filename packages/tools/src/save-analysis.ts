// save_analysis — Persist analysis to PostgreSQL + trigger episodic memory
// Used by: ProductAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

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
    },
    required: ['sessionId', 'type', 'content'],
  },
}

export async function saveAnalysis(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const sessionId = (input['sessionId'] as string | undefined) ?? context.sessionId
  const type = input['type'] as string | undefined
  const content = input['content'] as Record<string, unknown> | undefined
  const summary = input['summary'] as string | undefined

  if (!type || !content) {
    return { success: false, data: null, error: 'type and content are required', durationMs: Date.now() - start }
  }

  try {
    // TODO: Create Analysis record via Prisma
    // const analysis = await prisma.analysis.create({
    //   data: {
    //     sessionId,
    //     clientId: context.clientId,
    //     type: type as AnalysisType,
    //     content,
    //     summary: summary ?? null,
    //   },
    // })

    const analysisId = `ana_${Date.now()}`

    // Trigger episodic memory for this analysis
    // TODO: Store in AgentMemory
    // await prisma.agentMemory.create({
    //   data: {
    //     userId: context.userId,
    //     clientId: context.clientId,
    //     memoryType: 'EPISODIC',
    //     content: `Saved ${type} analysis: ${summary ?? 'no summary'}`,
    //     tags: [type, sessionId],
    //   },
    // })

    return {
      success: true,
      data: { id: analysisId, sessionId, type, summary: summary ?? null },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to save analysis: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
