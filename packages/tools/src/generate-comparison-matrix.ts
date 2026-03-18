// generate_comparison_matrix — Build feature comparison across competitors
// Used by: CompetitiveAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

export interface GenerateComparisonMatrixInput {
  competitorIds: string[]
}

export const generateComparisonMatrixDefinition: ToolDefinition = {
  name: 'generate_comparison_matrix',
  description: 'Generate a feature comparison matrix across multiple competitors. Pulls stored competitor data and organises it into a structured comparison.',
  inputSchema: {
    type: 'object',
    properties: {
      competitorIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'IDs of competitor entries to compare',
      },
    },
    required: ['competitorIds'],
  },
}

export async function generateComparisonMatrix(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const competitorIds = input['competitorIds'] as string[] | undefined

  if (!competitorIds || competitorIds.length === 0) {
    return { success: false, data: null, error: 'competitorIds array is required', durationMs: Date.now() - start }
  }

  try {
    // TODO: Fetch CompetitorEntry records by IDs
    // const competitors = await prisma.competitorEntry.findMany({
    //   where: { id: { in: competitorIds } },
    // })

    // TODO: Build unified feature matrix
    // Collect all unique features, then mark presence per competitor

    return {
      success: true,
      data: {
        competitorCount: competitorIds.length,
        matrix: [],
        message: 'Comparison matrix will be populated when competitor data is stored',
      },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to generate matrix: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
