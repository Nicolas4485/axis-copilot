// BulkProcessor — parallel document ingestion queue
// Accepts an array of { buffer, filename, mimeType } entries and ingests them
// concurrently (max CONCURRENCY=3) via IngestionPipeline.
// Emits progress events per-file for SSE streaming.

import type { PrismaClient } from '@prisma/client'
import type { InferenceEngine } from '@axis/inference'
import { IngestionPipeline } from './pipeline.js'
import type { SourceType } from '@prisma/client'

export interface BulkFile {
  buffer: Buffer
  filename: string
  mimeType: string
}

export type BulkProgressEvent =
  | { type: 'file_start';  filename: string; index: number; total: number }
  | { type: 'file_done';   filename: string; index: number; total: number; documentId: string; chunks: number }
  | { type: 'file_error';  filename: string; index: number; total: number; error: string }
  | { type: 'done';        succeeded: number; failed: number; total: number; documentIds: string[] }

interface BulkOptions {
  userId: string
  clientId?: string
  dealId?: string
  sourceType?: SourceType
  concurrency?: number
  enableChartExtraction?: boolean
}

const DEFAULT_CONCURRENCY = 3

export class BulkProcessor {
  private pipeline: IngestionPipeline

  constructor(
    private prisma: PrismaClient,
    private engine: InferenceEngine
  ) {
    this.pipeline = new IngestionPipeline({ prisma, engine })
  }

  async process(
    files: BulkFile[],
    options: BulkOptions,
    onProgress: (event: BulkProgressEvent) => void
  ): Promise<string[]> {
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
    const total = files.length
    const documentIds: string[] = []
    let succeeded = 0
    let failed = 0

    // Process in batches of `concurrency`
    for (let batchStart = 0; batchStart < total; batchStart += concurrency) {
      const batch = files.slice(batchStart, batchStart + concurrency)

      const results = await Promise.allSettled(
        batch.map(async (file, batchIdx) => {
          const index = batchStart + batchIdx
          onProgress({ type: 'file_start', filename: file.filename, index, total })

          const result = await this.pipeline.ingestDocument(
            file.buffer,
            file.filename,
            file.mimeType,
            options.userId,
            {
              ...(options.clientId ? { clientId: options.clientId } : {}),
              ...(options.dealId ? { dealId: options.dealId } : {}),
              sourceType: options.sourceType ?? 'UPLOAD',
              enableChartExtraction: options.enableChartExtraction ?? false,
            }
          )

          if (result.status === 'FAILED') {
            throw new Error('Ingestion failed')
          }

          return { documentId: result.documentId, chunks: result.chunkCount, index, filename: file.filename }
        })
      )

      for (const result of results) {
        const batchIdx = results.indexOf(result)
        const index = batchStart + batchIdx
        const file = batch[batchIdx]!

        if (result.status === 'fulfilled') {
          succeeded++
          documentIds.push(result.value.documentId)
          onProgress({
            type: 'file_done',
            filename: result.value.filename,
            index: result.value.index,
            total,
            documentId: result.value.documentId,
            chunks: result.value.chunks,
          })
        } else {
          failed++
          const error = result.reason instanceof Error ? result.reason.message : String(result.reason)
          onProgress({ type: 'file_error', filename: file.filename, index, total, error })
        }
      }
    }

    onProgress({ type: 'done', succeeded, failed, total, documentIds })
    return documentIds
  }
}
