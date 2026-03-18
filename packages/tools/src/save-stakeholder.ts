// save_stakeholder — Upsert PostgreSQL + create Neo4j edges
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
  const clientId = input['clientId'] as string | undefined
  const stakeholderData = input['stakeholder'] as Record<string, unknown> | undefined

  if (!clientId || !stakeholderData) {
    return { success: false, data: null, error: 'clientId and stakeholder are required', durationMs: Date.now() - start }
  }

  const name = stakeholderData['name'] as string
  const role = stakeholderData['role'] as string
  const influence = stakeholderData['influence'] as string
  const interest = stakeholderData['interest'] as string
  const reportsToId = stakeholderData['reportsToId'] as string | undefined

  try {
    // TODO: Upsert Stakeholder via Prisma (match on name + clientId)
    // const stakeholder = await prisma.stakeholder.upsert({
    //   where: { clientId_name: { clientId, name } },
    //   create: { clientId, ...stakeholderData },
    //   update: stakeholderData,
    // })

    const stakeholderId = `sh_${Date.now()}`

    // Create Neo4j Person node + WORKS_AT edge to Client
    // TODO: Wire Neo4j
    // await graphOps.upsertNode('Person', {
    //   id: stakeholderId, name, role, email,
    //   influence, clientId, sourceDocIds: [],
    // })
    // await graphOps.upsertRelationship('WORKS_AT', {
    //   fromId: stakeholderId, toId: clientId,
    //   role, influence,
    // })

    // If reportsTo, create REPORTS_TO edge
    // if (reportsToId) {
    //   await graphOps.upsertRelationship('REPORTS_TO', {
    //     fromId: stakeholderId, toId: reportsToId,
    //   })
    // }

    return {
      success: true,
      data: {
        id: stakeholderId,
        clientId,
        name,
        role,
        influence,
        interest,
        hasReportsTo: !!reportsToId,
      },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to save stakeholder: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
