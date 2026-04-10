// Batch Processor — parallel document processing with BullMQ priority queue
// Processes batches of BATCH_CONCURRENCY documents in parallel.
// Progress is logged; Redis pub/sub wiring happens in apps/api.

import { Queue, Worker, QueueEvents, type Job } from 'bullmq'
import type {
  BatchJobConfig,
  IngestionProgress,
  IngestionResult,
  SourceType,
} from './types.js'
import { IngestionPipeline } from './pipeline.js'

const QUEUE_NAME = 'document-ingestion'
const BATCH_CONCURRENCY = 5
const PROGRESS_CHANNEL = 'axis:ingestion:progress'

// Priority constants — lower BullMQ number = higher priority
const PRIORITY_P0 = 1   // client docs — highest
const PRIORITY_P1 = 5   // reports
const PRIORITY_P2 = 10  // general — lowest

/** Read Redis connection settings from environment. */
function redisConnection(): { host: string; port: number } {
  return {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  }
}

/** Map a BatchJobConfig.priority value to a BullMQ priority number. */
function toBullPriority(priority: number | undefined): number {
  if (priority === 0) return PRIORITY_P0
  if (priority === 1) return PRIORITY_P1
  return PRIORITY_P2
}

/** Data stored in each BullMQ job. */
interface IngestionJobData {
  /** Base64-encoded file content. Empty when fileId + fileResolver is used. */
  contentBase64: string
  filename: string
  mimeType: string
  userId: string
  clientId?: string | undefined
  sourceType: SourceType
  batchId: string
  /** Drive/external file ID — resolved by fileResolver in the worker. */
  fileId?: string | undefined
}

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
 * BatchProcessor handles parallel document ingestion with a BullMQ priority queue.
 *
 * Priority levels:
 *   P0 (priority 0) → BullMQ 1 — client documents, highest urgency
 *   P1 (priority 1) → BullMQ 5 — reports, medium urgency
 *   P2 (priority 2+) → BullMQ 10 — general content, lowest urgency
 *
 * Retry: 3 attempts with exponential backoff starting at 1 second.
 * Concurrency: 5 parallel workers per process.
 */
export class BatchProcessor {
  private pipeline: IngestionPipeline
  private queue: Queue<IngestionJobData, IngestionResult>
  private worker: Worker<IngestionJobData, IngestionResult>
  private queueEvents: QueueEvents
  private fileResolver:
    | ((fileId: string) => Promise<{ content: Buffer; filename: string; mimeType: string }>)
    | undefined

  constructor(options?: {
    prisma?: import('@prisma/client').PrismaClient | undefined
    /**
     * Optional resolver that fetches file content from an external store (e.g. Google Drive).
     * Required when using submitBatch() with fileIds; not needed for processBatchDirect().
     */
    fileResolver?: (fileId: string) => Promise<{ content: Buffer; filename: string; mimeType: string }>
  }) {
    const connection = redisConnection()

    if (options?.prisma) {
      this.pipeline = new IngestionPipeline({
        prisma: options.prisma,
        onProgress: (event: IngestionProgress) => { this.publishProgress(event) },
      })
    } else {
      this.pipeline = null as unknown as IngestionPipeline
    }

    this.fileResolver = options?.fileResolver

    this.queue = new Queue<IngestionJobData, IngestionResult>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    })

    this.queueEvents = new QueueEvents(QUEUE_NAME, { connection })

    this.worker = new Worker<IngestionJobData, IngestionResult>(
      QUEUE_NAME,
      (job: Job<IngestionJobData, IngestionResult>) => this.processJob(job),
      {
        connection,
        concurrency: BATCH_CONCURRENCY,
      }
    )

    this.worker.on('failed', (job, err: Error) => {
      console.error(
        `[BatchProcessor] Job ${job?.id ?? 'unknown'} failed ` +
        `(attempt ${job?.attemptsMade ?? '?'}): ${err.message}`
      )
    })

    this.worker.on('stalled', (jobId: string) => {
      console.warn(`[BatchProcessor] Job ${jobId} stalled — will be retried`)
    })
  }

  /**
   * Process a single ingestion job from the queue.
   * Resolves file content either from the serialised base64 payload
   * or via the registered fileResolver for Drive-based file IDs.
   */
  private async processJob(
    job: Job<IngestionJobData, IngestionResult>
  ): Promise<IngestionResult> {
    if (!this.pipeline) {
      throw new Error('[BatchProcessor] No IngestionPipeline — pass prisma to constructor')
    }

    const { contentBase64, fileId, filename, mimeType, userId, clientId, sourceType } = job.data

    await job.updateProgress(5)

    let resolvedContent: Buffer
    let resolvedFilename = filename
    let resolvedMimeType = mimeType

    if (contentBase64) {
      resolvedContent = Buffer.from(contentBase64, 'base64')
    } else if (fileId !== undefined && this.fileResolver) {
      const resolved = await this.fileResolver(fileId)
      resolvedContent = resolved.content
      resolvedFilename = resolved.filename
      resolvedMimeType = resolved.mimeType
    } else {
      throw new Error(
        `[BatchProcessor] Job ${job.id ?? 'unknown'}: no content and no fileResolver ` +
        `for fileId "${fileId ?? 'undefined'}"`
      )
    }

    await job.updateProgress(20)

    const result = await this.pipeline.ingestDocument(
      resolvedContent,
      resolvedFilename,
      resolvedMimeType,
      userId,
      {
        ...(clientId !== undefined ? { clientId } : {}),
        sourceType,
      }
    )

    await job.updateProgress(100)
    return result
  }

  /**
   * Submit a batch of Drive file IDs for queued ingestion.
   * Requires a fileResolver in the constructor to fetch content.
   * Returns a batch ID for status polling via getBatchStatus().
   */
  async submitBatch(config: BatchJobConfig): Promise<string> {
    const jobId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const priority = toBullPriority(config.priority)

    for (const fileId of config.fileIds) {
      await this.queue.add(
        'ingest',
        {
          contentBase64: '',
          filename: fileId,
          mimeType: 'application/octet-stream',
          userId: config.userId,
          clientId: config.clientId,
          sourceType: config.sourceType,
          batchId: jobId,
          fileId,
        },
        { priority }
      )
    }

    console.log(
      `[BatchProcessor] Submitted batch ${jobId}: ${config.fileIds.length} files, ` +
      `BullMQ priority ${priority}`
    )

    return jobId
  }

  /**
   * Enqueue a batch of files whose content is already in memory.
   * Waits for all jobs to complete and returns their results.
   * Failed jobs return a sentinel result with status "FAILED".
   */
  async processBatchDirect(
    files: Array<{ content: Buffer; filename: string; mimeType: string }>,
    userId: string,
    options?: { clientId?: string | undefined; sourceType?: SourceType | undefined; priority?: number | undefined }
  ): Promise<IngestionResult[]> {
    const batchId = `direct_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const priority = toBullPriority(options?.priority)

    const jobs = await Promise.all(
      files.map((file) =>
        this.queue.add(
          'ingest',
          {
            contentBase64: file.content.toString('base64'),
            filename: file.filename,
            mimeType: file.mimeType,
            userId,
            clientId: options?.clientId,
            sourceType: options?.sourceType ?? 'UPLOAD',
            batchId,
          },
          { priority }
        )
      )
    )

    const batchNum = Math.ceil(files.length / BATCH_CONCURRENCY)
    console.log(
      `[BatchProcessor] Enqueued ${files.length} files in batch ${batchId} ` +
      `(~${batchNum} wave${batchNum === 1 ? '' : 's'} of ${BATCH_CONCURRENCY})`
    )

    // Wait for every job; catch failures individually so one bad file
    // doesn't abort the rest of the batch.
    const results = await Promise.all(
      jobs.map(async (job): Promise<IngestionResult> => {
        try {
          return await job.waitUntilFinished(this.queueEvents)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          console.error(`[BatchProcessor] Job ${job.id ?? 'unknown'} failed: ${msg}`)
          return {
            documentId: `failed_${Date.now()}`,
            clientId: options?.clientId ?? null,
            docType: 'GENERAL',
            chunkCount: 0,
            entityCount: 0,
            conflicts: [],
            durationMs: 0,
            status: 'FAILED',
          }
        }
      })
    )

    return results
  }

  /**
   * Get the current status of a batch job by querying the BullMQ queue.
   *
   * Note: scans all jobs in the queue to filter by batchId.
   * For large queues, prefer a dedicated status store.
   */
  async getBatchStatus(jobId: string): Promise<BatchJobStatus> {
    const [waitingActive, doneJobs] = await Promise.all([
      this.queue.getJobs(['waiting', 'active', 'delayed', 'prioritized']),
      this.queue.getJobs(['completed', 'failed']),
    ])

    const allJobs = [...waitingActive, ...doneJobs].filter(
      (j) => j.data.batchId === jobId
    )

    const totalFiles = allJobs.length
    const completedJobs = doneJobs.filter((j) => j.data.batchId === jobId && j.returnvalue !== undefined)
    const failedJobs = doneJobs.filter((j) => j.data.batchId === jobId && j.failedReason !== undefined)
    const activeJobs = waitingActive.filter((j) => j.data.batchId === jobId)

    const status: BatchJobStatus['status'] =
      totalFiles === 0 ? 'queued'
      : failedJobs.length === totalFiles ? 'failed'
      : completedJobs.length === totalFiles ? 'completed'
      : activeJobs.length > 0 ? 'processing'
      : 'queued'

    const results = completedJobs
      .map((j) => j.returnvalue)
      .filter((r): r is IngestionResult => r !== undefined)

    const processedTimes = allJobs
      .map((j) => j.processedOn)
      .filter((t): t is number => t !== undefined)
    const finishedTimes = doneJobs
      .filter((j) => j.data.batchId === jobId)
      .map((j) => j.finishedOn)
      .filter((t): t is number => t !== undefined)

    const startedAt = processedTimes.length > 0
      ? new Date(Math.min(...processedTimes)).toISOString()
      : null
    const completedAt = status === 'completed' && finishedTimes.length > 0
      ? new Date(Math.max(...finishedTimes)).toISOString()
      : null

    return {
      jobId,
      totalFiles,
      completedFiles: completedJobs.length,
      failedFiles: failedJobs.length,
      results,
      status,
      startedAt,
      completedAt,
    }
  }

  /**
   * Publish a progress event.
   * Logs to console now; wire to Redis pub/sub in apps/api for SSE streaming.
   */
  private publishProgress(event: IngestionProgress): void {
    void PROGRESS_CHANNEL  // subscriber channel: axis:ingestion:progress
    console.log(
      `[BatchProcessor] [${event.documentId}] ` +
      `${event.stepNumber}/${event.totalSteps} ${event.step} — ${event.message}`
    )
  }

  /** Gracefully drain the worker, close the queue and event listener. */
  async shutdown(): Promise<void> {
    await this.worker.close()
    await this.queue.close()
    await this.queueEvents.close()
    console.log('[BatchProcessor] Shut down')
  }
}
