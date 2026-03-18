// ingest_document — Triggers the ingestion pipeline
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
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const fileId = input['fileId'] as string | undefined
  const userId = (input['userId'] as string | undefined) ?? context.userId
  const options = input['options'] as Record<string, unknown> | undefined

  if (!fileId) {
    return { success: false, data: null, error: 'fileId is required', durationMs: Date.now() - start }
  }

  try {
    // TODO: Fetch file content from Drive or upload storage
    // For now, this tool triggers async ingestion via the batch processor
    const { BatchProcessor } = await import('@axis/ingestion')
    const processor = new BatchProcessor()

    const jobId = await processor.submitBatch({
      fileIds: [fileId],
      userId,
      ...(options?.['clientId'] ? { clientId: options['clientId'] as string } : {}),
      sourceType: (options?.['sourceType'] as 'GDRIVE' | 'UPLOAD' | 'WEB' | 'MANUAL') ?? 'GDRIVE',
    })

    return {
      success: true,
      data: {
        jobId,
        fileId,
        status: 'queued',
        message: `Document ${fileId} queued for ingestion (job: ${jobId})`,
      },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to trigger ingestion: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
