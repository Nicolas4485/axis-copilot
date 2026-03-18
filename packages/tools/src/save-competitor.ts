// save_competitor — Store competitor entry + Neo4j COMPETES_WITH edge
// Used by: CompetitiveAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

export interface SaveCompetitorInput {
  analysisId: string
  competitor: {
    name: string
    website?: string
    strengths: string[]
    weaknesses: string[]
    features: string[]
    positioning?: string
  }
}

export const saveCompetitorDefinition: ToolDefinition = {
  name: 'save_competitor',
  description: 'Store a competitor entry with strengths, weaknesses, features, and positioning. Links to an existing competitive analysis.',
  inputSchema: {
    type: 'object',
    properties: {
      analysisId: { type: 'string' },
      competitor: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          website: { type: 'string' },
          strengths: { type: 'array', items: { type: 'string' } },
          weaknesses: { type: 'array', items: { type: 'string' } },
          features: { type: 'array', items: { type: 'string' } },
          positioning: { type: 'string' },
        },
        required: ['name', 'strengths', 'weaknesses', 'features'],
      },
    },
    required: ['analysisId', 'competitor'],
  },
}

export async function saveCompetitor(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const analysisId = input['analysisId'] as string | undefined
  const competitor = input['competitor'] as Record<string, unknown> | undefined

  if (!analysisId || !competitor) {
    return { success: false, data: null, error: 'analysisId and competitor are required', durationMs: Date.now() - start }
  }

  const name = competitor['name'] as string

  try {
    // TODO: Create CompetitorEntry via Prisma
    // await prisma.competitorEntry.create({ data: { analysisId, ...competitor } })

    // TODO: Upsert Neo4j Competitor node + COMPETES_WITH edge
    // await graphOps.upsertNode('Competitor', { id: `comp_${Date.now()}`, name, ... })
    // await graphOps.upsertRelationship('COMPETES_WITH', { fromId: clientId, toId: competitorId, ... })

    const competitorId = `comp_${Date.now()}`

    return {
      success: true,
      data: { id: competitorId, analysisId, name },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to save competitor: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
