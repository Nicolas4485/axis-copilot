// get_graph_context — Fuzzy match entity in Neo4j + readable text output
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
  const entityName = input['entityName'] as string | undefined
  const depth = Math.min((input['depth'] as number | undefined) ?? 2, 4)

  if (!entityName || entityName.trim().length === 0) {
    return { success: false, data: null, error: 'entityName is required', durationMs: Date.now() - start }
  }

  try {
    const { Neo4jClient, GraphOperations } = await import('@axis/knowledge-graph')
    const client = new Neo4jClient()
    const graphOps = new GraphOperations(client)

    // Try exact match first
    let result = await graphOps.findRelated(entityName, depth)

    // If no result, try fuzzy match via Cypher
    if (!result) {
      const fuzzyResult = await client.query(
        `MATCH (n) WHERE toLower(n.name) CONTAINS toLower($name) RETURN n.id AS id LIMIT 1`,
        { name: entityName }
      )

      if (fuzzyResult && fuzzyResult.records.length > 0) {
        const record = fuzzyResult.records[0]
        const matchedId = record?.get('id') as string | undefined
        if (matchedId) {
          result = await graphOps.findRelated(matchedId, depth)
        }
      }
    }

    if (!result) {
      return {
        success: true,
        data: { entityName, found: false, message: `No entity found matching "${entityName}"` },
        durationMs: Date.now() - start,
      }
    }

    // Build readable text
    const readableText = result.relationships
      .map((r) => `${result.node.name} -[${r.relationship.type}]-> ${r.targetNode.name}`)
      .join('\n')

    return {
      success: true,
      data: {
        entityName: result.node.name,
        found: true,
        relationshipCount: result.relationships.length,
        readableText: readableText || `${result.node.name} (no relationships found at depth ${depth})`,
        relationships: result.relationships.map((r) => ({
          type: r.relationship.type,
          targetName: r.targetNode.name,
        })),
      },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    // Graceful degradation: Neo4j unavailable is not a hard failure
    if (errorMsg.includes('unavailable') || errorMsg.includes('ECONNREFUSED')) {
      return {
        success: true,
        data: { entityName, found: false, message: 'Knowledge graph unavailable — using vector search only' },
        durationMs: Date.now() - start,
      }
    }
    return { success: false, data: null, error: `Graph context failed: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
