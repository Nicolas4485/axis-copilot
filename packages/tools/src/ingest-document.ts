// ingest_document — Trigger document ingestion into the knowledge base
// Used by: ProcessAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

export interface IngestDocumentInput {
  fileId: string
  userId: string
  options?: {
    clientId?: string
    sourceType?: 'GDRIVE' | 'UPLOAD' | 'WEB' | 'MANUAL'
    docType?: string
  }
}

export const ingestDocumentDefinition: ToolDefinition = {
  name: 'ingest_document',
  description: 'Trigger document ingestion into the knowledge base. Parses, chunks, embeds, and indexes the document for RAG retrieval.',
  inputSchema: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'File ID or path to ingest' },
      userId: { type: 'string' },
      options: {
        type: 'object',
        properties: {
          clientId: { type: 'string' },
          sourceType: { type: 'string', enum: ['GDRIVE', 'UPLOAD', 'WEB', 'MANUAL'] },
          docType: { type: 'string' },
        },
      },
    },
    required: ['fileId', 'userId'],
  },
}

export async function ingestDocument(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  // TODO: Delegate to @axis/ingestion pipeline
  // TODO: Create KnowledgeDocument record
  // TODO: Return document ID and chunk count
  return {
    success: false,
    data: null,
    error: 'ingest_document not yet implemented',
    durationMs: Date.now() - start,
  }
}
