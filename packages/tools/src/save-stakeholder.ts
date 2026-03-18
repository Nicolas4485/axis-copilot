// save_stakeholder — Create or update a stakeholder record
// Used by: StakeholderAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

export interface SaveStakeholderInput {
  clientId: string
  stakeholder: {
    name: string
    role: string
    email?: string
    phone?: string
    influence: 'HIGH' | 'MEDIUM' | 'LOW'
    interest: 'HIGH' | 'MEDIUM' | 'LOW'
    department?: string
    reportsToId?: string
    notes?: string
  }
}

export const saveStakeholderDefinition: ToolDefinition = {
  name: 'save_stakeholder',
  description: 'Create or update a stakeholder record for a client. Includes influence/interest levels for Power-Interest mapping.',
  inputSchema: {
    type: 'object',
    properties: {
      clientId: { type: 'string' },
      stakeholder: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          influence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          interest: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          department: { type: 'string' },
          reportsToId: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['name', 'role', 'influence', 'interest'],
      },
    },
    required: ['clientId', 'stakeholder'],
  },
}

export async function saveStakeholder(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  // TODO: Upsert Stakeholder via Prisma (match on name + clientId)
  return {
    success: false,
    data: null,
    error: 'save_stakeholder not yet implemented',
    durationMs: Date.now() - start,
  }
}
