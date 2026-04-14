import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { Neo4jClient, GraphOperations } from '@axis/knowledge-graph'

export const documentsRouter = Router()

// Map Neo4j node labels → document viewer entity types
const LABEL_TO_ENTITY_TYPE: Record<string, string> = {
  Client: 'Organization',
  Competitor: 'Organization',
  Technology: 'Technology',
  Person: 'Person',
  Process: 'Process',
  Industry: 'Concept',
  Concept: 'Concept',
}

/**
 * GET /api/documents?clientId=xxx — List documents for the authenticated user
 */
documentsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const clientId = req.query['clientId'] as string | undefined

    const docs = await prisma.knowledgeDocument.findMany({
      where: {
        userId: req.userId!,
        ...(clientId ? { clientId } : {}),
      },
      select: {
        id: true,
        title: true,
        mimeType: true,
        clientId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({
      documents: docs.map((d) => ({
        ...d,
        mimeType: d.mimeType ?? 'application/octet-stream',
      })),
      requestId: req.requestId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({
      error: 'Failed to fetch documents',
      code: 'DOCUMENTS_FETCH_ERROR',
      details: errorMsg,
      requestId: req.requestId,
    })
  }
})

/**
 * GET /api/documents/:id — Get document detail with chunk content and entities
 */
documentsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const docId = req.params['id']!

    const doc = await prisma.knowledgeDocument.findFirst({
      where: { id: docId, userId: req.userId! },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
          select: { content: true, chunkIndex: true },
        },
      },
    })

    if (!doc) {
      res.status(404).json({
        error: 'Document not found',
        code: 'NOT_FOUND',
        requestId: req.requestId,
      })
      return
    }

    // Concatenate chunks into full document content
    const content = doc.chunks.map((c) => c.content).join('\n\n')

    // Pull entities from Neo4j and find their positions in the text
    const entities: Array<{
      id: string
      text: string
      entityType: string
      start: number
      end: number
      nodeId: string | null
    }> = []

    if (doc.clientId) {
      try {
        const neo4j = new Neo4jClient()
        if (neo4j.isAvailable()) {
          const graphOps = new GraphOperations(neo4j)
          const subgraph = await graphOps.getClientSubgraph(doc.clientId)
          const nodes = subgraph?.nodes ?? []

          // Skip Document/Meeting/Decision nodes — those aren't text entities
          const SKIP_LABELS = new Set(['Document', 'Meeting', 'Decision'])

          for (const node of nodes) {
            const label: string = (node as { label: string }).label ?? ''
            if (SKIP_LABELS.has(label)) continue

            const name: string = (node as { name: string }).name ?? ''
            if (!name || name.length < 2) continue

            const idx = content.indexOf(name)
            if (idx >= 0) {
              entities.push({
                id: (node as { id: string }).id,
                text: name,
                entityType: LABEL_TO_ENTITY_TYPE[label] ?? 'Concept',
                start: idx,
                end: idx + name.length,
                nodeId: (node as { id: string }).id,
              })
            }
          }
        }
      } catch {
        // Neo4j unavailable — return empty entities, do not crash
      }
    }

    res.json({
      id: doc.id,
      title: doc.title,
      content,
      mimeType: doc.mimeType ?? 'application/octet-stream',
      entities,
      createdAt: doc.createdAt,
      requestId: req.requestId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({
      error: 'Failed to fetch document',
      code: 'DOCUMENT_FETCH_ERROR',
      details: errorMsg,
      requestId: req.requestId,
    })
  }
})
