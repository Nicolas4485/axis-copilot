// search_knowledge_base — Calls RAGEngine for semantic search
// Used by: All agents

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

// Module-level singletons — one connection pool for the process lifetime
let _prisma: import('@prisma/client').PrismaClient | null = null
let _rag: import('@axis/rag').RAGEngine | null = null

async function getRAG(): Promise<import('@axis/rag').RAGEngine> {
  if (_rag) return _rag
  const { RAGEngine } = await import('@axis/rag')
  const { PrismaClient } = await import('@prisma/client')
  _prisma = new PrismaClient()
  _rag = new RAGEngine({ prisma: _prisma })
  return _rag
}

export interface SearchKnowledgeBaseInput {
  query: string
  clientId?: string
  limit?: number
}

export const searchKnowledgeBaseDefinition: ToolDefinition = {
  name: 'search_knowledge_base',
  description: 'Search the indexed knowledge base using semantic vector search. Returns relevant document chunks with source attribution.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      clientId: { type: 'string', description: 'Filter results to a specific client' },
      limit: { type: 'number', description: 'Max results to return (default 5)' },
    },
    required: ['query'],
  },
}

export async function searchKnowledgeBase(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const query = input['query'] as string | undefined
  const clientId = (input['clientId'] as string | undefined) ?? context.clientId
  const limit = (input['limit'] as number | undefined) ?? 5

  if (!query || query.trim().length === 0) {
    return { success: false, data: null, error: 'Query is required', durationMs: Date.now() - start }
  }

  try {
    const rag = await getRAG()

    const result = await rag.query(query, context.userId, clientId ?? null, {
      maxChunks: limit,
    })

    return {
      success: true,
      data: {
        query,
        citationCount: result.citations.length,
        citations: result.citations.map((c) => ({
          sourceTitle: c.sourceTitle,
          content: c.content,
          relevanceScore: c.relevanceScore,
        })),
        conflictCount: result.conflicts.length,
        conflicts: result.conflicts,
        graphInsightCount: result.graphInsights.length,
        tokensUsed: result.tokensUsed,
      },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Knowledge base search failed: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
