// update_client_record — Update client profile fields
// Used by: IntakeAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

export interface UpdateClientRecordInput {
  clientId: string
  updates: {
    name?: string
    industry?: string
    companySize?: string
    website?: string
    notes?: string
    techStack?: string[]
  }
}

export const updateClientRecordDefinition: ToolDefinition = {
  name: 'update_client_record',
  description: 'Update fields on a client record. Only provided fields are updated.',
  inputSchema: {
    type: 'object',
    properties: {
      clientId: { type: 'string', description: 'Client ID to update' },
      updates: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          industry: { type: 'string' },
          companySize: { type: 'string' },
          website: { type: 'string' },
          notes: { type: 'string' },
          techStack: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    required: ['clientId', 'updates'],
  },
}

export async function updateClientRecord(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  // TODO: Validate input with Zod
  // TODO: Update client via Prisma
  return {
    success: false,
    data: null,
    error: 'update_client_record not yet implemented',
    durationMs: Date.now() - start,
  }
}
