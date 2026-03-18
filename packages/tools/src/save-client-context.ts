// save_client_context — Persist structured client context to DB
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
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  // TODO: Validate input with Zod
  // TODO: Create ClientContext record via Prisma
  // TODO: Link to current session
  return {
    success: false,
    data: null,
    error: 'save_client_context not yet implemented',
    durationMs: Date.now() - start,
  }
}
