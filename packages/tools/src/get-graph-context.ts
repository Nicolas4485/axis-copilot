// get_graph_context — Retrieve entity relationships from Neo4j knowledge graph
// Used by: All agents

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

export interface GetGraphContextInput {
  entityName: string
  depth?: number
}

export const getGraphContextDefinition: ToolDefinition = {
  name: 'get_graph_context',
  description: 'Retrieve entity relationships from the knowledge graph. Returns connected entities and their relationships up to the specified depth.',
  inputSchema: {
    type: 'object',
    properties: {
      entityName: { type: 'string', description: 'Name of the entity to look up' },
      depth: { type: 'number', description: 'How many relationship hops to traverse (default 2, max 4)' },
    },
    required: ['entityName'],
  },
}

export async function getGraphContext(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  // TODO: Query Neo4j for entity and relationships
  // TODO: Format as structured graph context
  // TODO: Fall back gracefully if Neo4j unavailable
  return {
    success: false,
    data: null,
    error: 'get_graph_context not yet implemented',
    durationMs: Date.now() - start,
  }
}
