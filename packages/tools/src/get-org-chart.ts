// get_org_chart — Retrieve stakeholder org chart for a client
// Used by: StakeholderAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

export interface GetOrgChartInput {
  clientId: string
}

export const getOrgChartDefinition: ToolDefinition = {
  name: 'get_org_chart',
  description: 'Retrieve the stakeholder org chart for a client. Returns stakeholders with reporting relationships and influence/interest levels.',
  inputSchema: {
    type: 'object',
    properties: {
      clientId: { type: 'string', description: 'Client ID' },
    },
    required: ['clientId'],
  },
}

export async function getOrgChart(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  // TODO: Query Stakeholder + StakeholderRelation records
  // TODO: Build hierarchical tree structure
  return {
    success: false,
    data: null,
    error: 'get_org_chart not yet implemented',
    durationMs: Date.now() - start,
  }
}
