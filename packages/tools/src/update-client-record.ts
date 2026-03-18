// update_client_record — Update client profile fields in PostgreSQL
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
  const clientId = input['clientId'] as string | undefined
  const updates = input['updates'] as Record<string, unknown> | undefined

  if (!clientId || !updates) {
    return { success: false, data: null, error: 'clientId and updates are required', durationMs: Date.now() - start }
  }

  try {
    // TODO: Update via Prisma
    // const updated = await prisma.client.update({
    //   where: { id: clientId },
    //   data: updates,
    // })

    const updatedFields = Object.keys(updates).filter((k) => updates[k] !== undefined)

    return {
      success: true,
      data: { clientId, updatedFields, fieldCount: updatedFields.length },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to update client: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
