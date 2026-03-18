// update_stakeholder_influence — Update Power-Interest levels in PostgreSQL
// Used by: StakeholderAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

export interface UpdateStakeholderInfluenceInput {
  stakeholderId: string
  influence: 'HIGH' | 'MEDIUM' | 'LOW'
  interest: 'HIGH' | 'MEDIUM' | 'LOW'
}

export const updateStakeholderInfluenceDefinition: ToolDefinition = {
  name: 'update_stakeholder_influence',
  description: 'Update a stakeholder\'s influence and interest levels for Power-Interest quadrant mapping.',
  inputSchema: {
    type: 'object',
    properties: {
      stakeholderId: { type: 'string' },
      influence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
      interest: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
    },
    required: ['stakeholderId', 'influence', 'interest'],
  },
}

export async function updateStakeholderInfluence(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const stakeholderId = input['stakeholderId'] as string | undefined
  const influence = input['influence'] as string | undefined
  const interest = input['interest'] as string | undefined

  if (!stakeholderId || !influence || !interest) {
    return { success: false, data: null, error: 'stakeholderId, influence, and interest are required', durationMs: Date.now() - start }
  }

  try {
    // TODO: Update via Prisma
    // await prisma.stakeholder.update({
    //   where: { id: stakeholderId },
    //   data: { influence, interest },
    // })

    // Determine Power-Interest quadrant
    const quadrant =
      influence === 'HIGH' && interest === 'HIGH' ? 'Manage Closely' :
      influence === 'HIGH' && interest !== 'HIGH' ? 'Keep Satisfied' :
      influence !== 'HIGH' && interest === 'HIGH' ? 'Keep Informed' :
      'Monitor'

    return {
      success: true,
      data: { stakeholderId, influence, interest, quadrant },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to update stakeholder: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
