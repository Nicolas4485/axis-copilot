// get_competitive_context — Query stored competitive intel for a client
// Used by: ProductAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

export interface GetCompetitiveContextInput {
  clientId: string
}

export const getCompetitiveContextDefinition: ToolDefinition = {
  name: 'get_competitive_context',
  description: 'Retrieve previously stored competitive analysis and competitor entries for a client.',
  inputSchema: {
    type: 'object',
    properties: {
      clientId: { type: 'string', description: 'Client ID to look up competitors for' },
    },
    required: ['clientId'],
  },
}

export async function getCompetitiveContext(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const clientId = input['clientId'] as string | undefined

  if (!clientId) {
    return { success: false, data: null, error: 'clientId is required', durationMs: Date.now() - start }
  }

  try {
    // TODO: Query Analysis records of type COMPETITIVE + CompetitorEntry
    // const analyses = await prisma.analysis.findMany({
    //   where: { clientId, type: 'COMPETITIVE' },
    //   include: { competitors: true },
    //   orderBy: { createdAt: 'desc' },
    //   take: 5,
    // })

    return {
      success: true,
      data: { clientId, analyses: [], competitorCount: 0, message: 'No competitive analyses found yet' },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to get competitive context: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
