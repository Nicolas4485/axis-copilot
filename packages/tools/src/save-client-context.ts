// save_client_context / get_client_context — Persist and retrieve structured client context
// Used by: IntakeAgent, Aria

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'
import { PrismaClient } from '@prisma/client'

let _prisma: PrismaClient | null = null
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient()
  return _prisma
}

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

  const summary = (ctxData['summary'] as string | undefined) ?? ''
  const painPoints = (ctxData['painPoints'] as string[] | undefined) ?? []
  const goals = (ctxData['goals'] as string[] | undefined) ?? []
  const budgetSignal = ctxData['budgetSignal'] as string | undefined

  try {
    const prisma = getPrisma()
    const memory = await prisma.agentMemory.create({
      data: {
        userId: context.userId,
        clientId,
        memoryType: 'SEMANTIC',
        content: JSON.stringify({
          summary,
          painPoints,
          goals,
          budgetSignal: budgetSignal ?? null,
          analysisType: 'client_context',
        }),
        tags: ['client_context', clientId, context.sessionId],
      },
    })

    return {
      success: true,
      data: {
        id: memory.id,
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

// ─── get_client_context ───────────────────────────────────────────────────────

export const getClientContextDefinition: ToolDefinition = {
  name: 'get_client_context',
  description: 'Retrieve previously saved client context: pain points, goals, budget signals, and key notes. Call this when the user asks about a client\'s situation, priorities, or budget — especially follow-up questions about context saved in prior sessions.',
  inputSchema: {
    type: 'object',
    properties: {
      clientId: { type: 'string', description: 'Client ID to retrieve context for (optional — uses session client if omitted)' },
      limit: { type: 'number', description: 'Max records to return (default 5, most recent first)' },
    },
    required: [],
  },
}

export async function getClientContext(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const resolvedClientId = (input['clientId'] as string | undefined) ?? context.clientId ?? null
  const limit = (input['limit'] as number | undefined) ?? 5

  if (!resolvedClientId) {
    return { success: false, data: null, error: 'No clientId provided and no client in session context', durationMs: Date.now() - start }
  }

  try {
    const prisma = getPrisma()
    const records = await prisma.agentMemory.findMany({
      where: {
        userId: context.userId,
        clientId: resolvedClientId,
        memoryType: 'SEMANTIC',
        content: { contains: '"client_context"' },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, content: true, createdAt: true },
    })

    const parsed = records.map((r) => {
      try {
        return { id: r.id, createdAt: r.createdAt.toISOString(), ...(JSON.parse(r.content) as Record<string, unknown>) }
      } catch {
        return { id: r.id, createdAt: r.createdAt.toISOString(), summary: r.content }
      }
    })

    return {
      success: true,
      data: { clientId: resolvedClientId, records: parsed, total: parsed.length },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to retrieve client context: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
