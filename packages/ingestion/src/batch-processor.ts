// Batch Processor — parallel document processing with BullMQ priority queue
// Processes batches of 5 documents, emits progress via Redis pub/sub

import type {
  BatchJobConfig,
  IngestionProgress,
  IngestionResult,
  SourceType,
} from './types.js'
import { IngestionPipeline } from './pipeline.js'

const BATCH_CONCURRENCY = 5
const PROGRESS_CHANNEL = 'axis:ingestion:progress'

/** Job status tracking */
export interface BatchJobStatus {
  jobId: string
  totalFiles: number
  completedFiles: number
  failedFiles: number
  results: IngestionResult[]
  status: 'queued' | 'processing' | 'completed' | 'failed'
  startedAt: string | null
  completedAt: string | null
}

/**
 * BatchProcessor handles parallel document ingestion with priority queuing.
 *
 * Uses BullMQ for job queue management and Redis pub/sub for progress events.
 * Processes documents in parallel batches of 5.
 */
export class BatchProcessor {
  private pipeline: IngestionPipeline
  // TODO: BullMQ queue instance
  // private queue: Queue
  // private worker: Worker

  constructor(options?: { prisma?: import('@prisma/client').PrismaClient }) {
    if (options?.prisma) {
      this.pipeline = new IngestionPipeline({
        prisma: options.prisma,
        onProgress: (event: IngestionProgress) => {
          this.publishProgress(event)
        },
      })
    } else {
      this.pipeline = null as unknown as IngestionPipeline
    }

    // TODO: Initialise BullMQ queue and worker
    // this.queue = new Queue('axis:ingestion', {
    //   connection: { host: 'localhost', port: 6379 },
    //   defaultJobOptions: {
    //     attempts: 3,
    //     backoff: { type: 'exponential', delay: 1000 },
    //     removeOnComplete: 100,
    //     removeOnFail: 50,
    //   },
    // })
    //
    // this.worker = new Worker('axis:ingestion', (job) => this.processJob(job), {
    //   connection: { host: 'localhost', port: 6379 },
    //   concurrency: BATCH_CONCURRENCY,
    // })
  }

  /**
   * Submit a batch of files for processing.
   * Returns a job ID for tracking progress.
   */
  async submitBatch(config: BatchJobConfig): Promise<string> {
    const jobId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // TODO: Add jobs to BullMQ queue with priority
    // for (const fileId of config.fileIds) {
    //   await this.queue.add('ingest', {
    //     fileId,
    //     userId: config.userId,
    //     clientId: config.clientId,
    //     sourceType: config.sourceType,
    //     batchId: jobId,
    //   }, {
    //     priority: config.priority ?? 5,
    //   })
    // }

    console.log(
      `[BatchProcessor] Submitted batch ${jobId}: ${config.fileIds.length} files, ` +
      `priority ${config.priority ?? 5}, concurrency ${BATCH_CONCURRENCY}`
    )

    return jobId
  }

  /**
   * Process a batch of files in parallel groups.
   * Used for direct processing without BullMQ.
   */
  async processBatchDirect(
    files: Array<{ content: Buffer; filename: string; mimeType: string }>,
    userId: string,
    options?: { clientId?: string; sourceType?: SourceType }
  ): Promise<IngestionResult[]> {
    const results: IngestionResult[] = []

    // Process in parallel batches of BATCH_CONCURRENCY
    for (let i = 0; i < files.length; i += BATCH_CONCURRENCY) {
      const batch = files.slice(i, i + BATCH_CONCURRENCY)
      const batchNum = Math.floor(i / BATCH_CONCURRENCY) + 1
      const totalBatches = Math.ceil(files.length / BATCH_CONCURRENCY)

      console.log(
        `[BatchProcessor] Processing batch ${batchNum}/${totalBatches} ` +
        `(${batch.length} files)`
      )

      const batchResults = await Promise.allSettled(
        batch.map((file) =>
          this.pipeline.ingestDocument(
            file.content,
            file.filename,
            file.mimeType,
            userId,
            {
              ...(options?.clientId ? { clientId: options.clientId } : {}),
              sourceType: options?.sourceType ?? 'UPLOAD',
            }
          )
        )
      )

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          results.push({
            documentId: `failed_${Date.now()}`,
            clientId: options?.clientId ?? null,
            docType: 'GENERAL',
            chunkCount: 0,
            entityCount: 0,
            conflicts: [],
            durationMs: 0,
            status: 'FAILED',
          })
        }
      }
    }

    return results
  }

  /**
   * Get the status of a batch job.
   */
  async getBatchStatus(jobId: string): Promise<BatchJobStatus> {
    // TODO: Query BullMQ for job status
    // const jobs = await this.queue.getJobs(['waiting', 'active', 'completed', 'failed'])
    // const batchJobs = jobs.filter(j => j.data.batchId === jobId)

    return {
      jobId,
      totalFiles: 0,
      completedFiles: 0,
      failedFiles: 0,
      results: [],
      status: 'queued',
      startedAt: null,
      completedAt: null,
    }
  }

  /**
   * Publish progress event via Redis pub/sub.
   */
  private publishProgress(event: IngestionProgress): void {
    // TODO: Publish to Redis
    // await redis.publish(PROGRESS_CHANNEL, JSON.stringify(event))
    void event
    void PROGRESS_CHANNEL
  }

  /**
   * Gracefully shut down the processor.
   */
  async shutdown(): Promise<void> {
    // TODO: Close BullMQ worker and queue
    // await this.worker.close()
    // await this.queue.close()
    console.log('[BatchProcessor] Shut down')
  }
}
