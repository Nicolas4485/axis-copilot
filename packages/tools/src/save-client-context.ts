// save_client_context — Persist structured client context to PostgreSQL + Neo4j
// Used by: IntakeAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

export interface SaveClientContextInput {
  clientId: string
  context: {
    summary: string
    painPoints: string[]
    goals: string[]
    budgetSignal?: string
  }
}

export const saveClientContextDefinition: ToolDefinition = {
  name: 'save_client_context',
  description: 'Save structured client context (pain points, goals, budget signals) to the database. Creates a ClientContext record linked to the current session.',
  inputSchema: {
    type: 'object',
    properties: {
      clientId: { type: 'string', description: 'Client ID' },
      context: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Summary of client context' },
          painPoints: { type: 'array', items: { type: 'string' }, description: 'Identified pain points' },
          goals: { type: 'array', items: { type: 'string' }, description: 'Client goals' },
          budgetSignal: { type: 'string', description: 'Budget indication if mentioned' },
        },
        required: ['summary', 'painPoints', 'goals'],
      },
    },
    required: ['clientId', 'context'],
  },
}

export async function saveClientContext(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const clientId = input['clientId'] as string | undefined
  const ctxData = input['context'] as Record<string, unknown> | undefined

  if (!clientId || !ctxData) {
    return { success: false, data: null, error: 'clientId and context are required', durationMs: Date.now() - start }
  }

  const summary = ctxData['summary'] as string ?? ''
  const painPoints = ctxData['painPoints'] as string[] ?? []
  const goals = ctxData['goals'] as string[] ?? []
  const budgetSignal = ctxData['budgetSignal'] as string | undefined

  try {
    // TODO: Create ClientContext record via Prisma
    // const record = await prisma.clientContext.create({
    //   data: {
    //     clientId,
    //     sessionId: context.sessionId,
    //     summary,
    //     painPoints,
    //     goals,
    //     budgetSignal: budgetSignal ?? null,
    //   },
    // })

    // TODO: Upsert Neo4j Client node with pain points and goals
    // await graphOps.upsertNode('Client', {
    //   id: clientId, name: clientName,
    //   sourceDocIds: [], ...
    // })

    const recordId = `ctx_${Date.now()}`

    return {
      success: true,
      data: {
        id: recordId,
        clientId,
        sessionId: context.sessionId,
        summary,
        painPointCount: painPoints.length,
        goalCount: goals.length,
        hasBudgetSignal: !!budgetSignal,
      },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to save client context: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
