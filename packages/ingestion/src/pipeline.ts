// Ingestion Pipeline — 15-step document processing flow
// fetch → checksum → attribute → parse → classify → chunk → contextual_retrieval → embed →
// store chunks → extract entities → verify entities → conflict detect →
// update records → episodic memory → publish event → finalise

import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { Redis } from 'ioredis'
import { InferenceEngine } from '@axis/inference'
import { getParser } from './parsers/index.js'
import { extractChartPages } from './parsers/chart-extractor.js'
import { DriveDiscovery } from './drive-discovery.js'
import type { NodeLabel } from '@axis/knowledge-graph'
import type {
  ParsedDocument,
  DocumentChunk,
  ExtractedEntity,
  IngestionResult,
  ConflictDetected,
  IngestionProgress,
  SourceType,
  DocType,
} from './types.js'

/** Channel name for ingestion completion events */
const INGESTION_CHANNEL = 'axis:ingestion:complete'

const CHUNK_TARGET_TOKENS = 500    // 400–600 range
const CHUNK_MIN_TOKENS = 400
const CHUNK_MAX_TOKENS = 600
const CHUNK_OVERLAP_TOKENS = 50
const TOTAL_STEPS = 15

/** Approximate tokens from character count (1 token ≈ 4 chars for English) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Section-aware chunking — exported for unit testing.
 *
 * Priority 1: chunk by section boundaries, merge small sections, sub-split large ones.
 * Priority 2: chunk by paragraph breaks (\n\n) when no sections exist.
 * Priority 3: sentence-snapped token chunking (original logic) as last resort.
 */
export function chunkDocumentImpl(parsed: ParsedDocument): DocumentChunk[] {
  const chunks: DocumentChunk[] = []
  const text = parsed.text
  const overlapChars = CHUNK_OVERLAP_TOKENS * 4
  const charsPerChunk = CHUNK_TARGET_TOKENS * 4
  let chunkIndex = 0

  function subSplit(content: string, titlePrefix: string | undefined): DocumentChunk[] {
    const result: DocumentChunk[] = []
    let position = 0

    while (position < content.length) {
      let endPos = Math.min(
        position + charsPerChunk + (CHUNK_MAX_TOKENS - CHUNK_TARGET_TOKENS) * 4,
        content.length
      )

      if (endPos < content.length) {
        const searchStart = Math.max(position + CHUNK_MIN_TOKENS * 4, endPos - 200)
        const searchRegion = content.slice(searchStart, endPos + 200)
        const sentenceEnd = searchRegion.search(/[.!?]\s+/)
        if (sentenceEnd >= 0) {
          endPos = searchStart + sentenceEnd + 1
        }
      }

      const chunkText = content.slice(position, endPos).trim()
      if (chunkText.length > 0) {
        result.push({
          content: chunkText,
          chunkIndex: 0, // assigned after count is known
          tokens: estimateTokens(chunkText),
          metadata: { sectionTitle: titlePrefix },
        })
      }

      const nextPosition = endPos - overlapChars
      if (nextPosition <= position || nextPosition < 0) {
        position = endPos
      } else {
        position = nextPosition
      }
    }

    if (titlePrefix && result.length > 1) {
      const total = result.length
      for (let k = 0; k < total; k++) {
        result[k]!.metadata.sectionTitle = `${titlePrefix} (${k + 1}/${total})`
      }
    }

    return result
  }

  // Priority 1: Section-aware chunking
  const activeSections = parsed.sections.filter((s) => s.content.trim().length > 0)
  if (activeSections.length > 0) {
    let i = 0
    while (i < activeSections.length) {
      let currentContent = activeSections[i]!.content
      let currentTitle = activeSections[i]!.title

      // Merge small sections with subsequent ones while combined stays in range
      while (estimateTokens(currentContent) < CHUNK_MIN_TOKENS && i + 1 < activeSections.length) {
        const next = activeSections[i + 1]!
        const merged = currentContent + '\n\n' + next.content
        if (estimateTokens(merged) <= CHUNK_MAX_TOKENS) {
          currentContent = merged
          currentTitle = currentTitle ? `${currentTitle} / ${next.title}` : next.title
          i++
        } else {
          break
        }
      }

      if (estimateTokens(currentContent) > CHUNK_MAX_TOKENS) {
        const sub = subSplit(currentContent, currentTitle || undefined)
        for (const s of sub) {
          s.chunkIndex = chunkIndex++
          chunks.push(s)
        }
      } else {
        chunks.push({
          content: currentContent.trim(),
          chunkIndex: chunkIndex++,
          tokens: estimateTokens(currentContent),
          metadata: { sectionTitle: currentTitle || undefined },
        })
      }

      i++
    }
  }
  // Priority 2: Paragraph-aware chunking
  else if (text.includes('\n\n')) {
    const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 0)
    let accumulated = ''
    let accTokens = 0

    for (const para of paragraphs) {
      const paraTokens = estimateTokens(para)

      if (paraTokens > CHUNK_MAX_TOKENS) {
        if (accumulated.trim().length > 0) {
          chunks.push({ content: accumulated.trim(), chunkIndex: chunkIndex++, tokens: accTokens, metadata: {} })
        }
        const sub = subSplit(para, undefined)
        for (const s of sub) {
          s.chunkIndex = chunkIndex++
          chunks.push(s)
        }
        accumulated = ''
        accTokens = 0
      } else if (accTokens + paraTokens > CHUNK_MAX_TOKENS) {
        if (accumulated.trim().length > 0) {
          chunks.push({ content: accumulated.trim(), chunkIndex: chunkIndex++, tokens: accTokens, metadata: {} })
        }
        const overlapText = accumulated.slice(-overlapChars)
        accumulated = overlapText ? overlapText + '\n\n' + para : para
        accTokens = estimateTokens(accumulated)
      } else {
        accumulated = accumulated ? accumulated + '\n\n' + para : para
        accTokens += paraTokens
      }
    }

    if (accumulated.trim().length > 0) {
      chunks.push({ content: accumulated.trim(), chunkIndex: chunkIndex++, tokens: accTokens, metadata: {} })
    }
  }
  // Priority 3: Sentence-snapped token chunking (original logic, last resort)
  else {
    let position = 0

    while (position < text.length) {
      let endPos = Math.min(
        position + charsPerChunk + (CHUNK_MAX_TOKENS - CHUNK_TARGET_TOKENS) * 4,
        text.length
      )

      if (endPos < text.length) {
        const searchStart = Math.max(position + CHUNK_MIN_TOKENS * 4, endPos - 200)
        const searchRegion = text.slice(searchStart, endPos + 200)
        const sentenceEnd = searchRegion.search(/[.!?]\s+/)
        if (sentenceEnd >= 0) {
          endPos = searchStart + sentenceEnd + 1
        }
      }

      const chunkText = text.slice(position, endPos).trim()
      if (chunkText.length > 0) {
        chunks.push({
          content: chunkText,
          chunkIndex: chunkIndex++,
          tokens: estimateTokens(chunkText),
          metadata: {},
        })
      }

      const nextPosition = endPos - overlapChars
      if (nextPosition <= position || nextPosition < 0) {
        position = endPos
      } else {
        position = nextPosition
      }
    }
  }

  if (chunks.length === 0 && text.trim().length > 0) {
    chunks.push({ content: text.trim(), chunkIndex: 0, tokens: estimateTokens(text), metadata: {} })
  }

  return chunks
}

/**
 * The core ingestion pipeline. Processes a single document through 15 steps.
 *
 * All model calls go through InferenceEngine — never call APIs directly.
 * All persistence goes through Prisma — no database-agnostic abstractions.
 */
export class IngestionPipeline {
  private engine: InferenceEngine
  private discovery: DriveDiscovery
  private prisma: PrismaClient
  private redis: Redis | null
  private onProgress?: ((event: IngestionProgress) => void) | undefined

  constructor(options?: {
    engine?: InferenceEngine
    prisma?: PrismaClient
    redis?: Redis
    onProgress?: (event: IngestionProgress) => void
  }) {
    if (!options?.prisma) {
      throw new Error('IngestionPipeline requires a PrismaClient instance. Pass it via { prisma } in the constructor.')
    }
    this.engine = options.engine ?? new InferenceEngine()
    this.prisma = options.prisma
    this.discovery = new DriveDiscovery(this.engine)
    this.onProgress = options.onProgress

    // Wire Redis pub/sub if available
    if (options?.redis) {
      this.redis = options.redis
    } else if (process.env['REDIS_URL']) {
      try {
        this.redis = new Redis(process.env['REDIS_URL'], {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        })
        this.redis.on('error', () => { /* non-critical — silently degrade */ })
      } catch {
        this.redis = null
      }
    } else {
      this.redis = null
    }
  }

  /**
   * Ingest a single document through the full 15-step pipeline.
   */
  async ingestDocument(
    fileContent: Buffer,
    filename: string,
    mimeType: string,
    userId: string,
    options?: {
      clientId?: string
      dealId?: string
      sourceType?: SourceType
      sourceId?: string
      sourcePath?: string
      enableChartExtraction?: boolean
      forceReprocess?: boolean
    }
  ): Promise<IngestionResult> {
    const startTime = Date.now()
    const documentId = this.generateId()
    const sourceType = options?.sourceType ?? 'UPLOAD'
    let clientId = options?.clientId ?? null
    let docType: DocType = 'GENERAL'
    let chunkCount = 0
    let entityCount = 0
    const conflicts: ConflictDetected[] = []

    try {
      // Step 1: Fetch — content already provided as Buffer
      this.emitProgress(documentId, 'fetch', 1, 'Received document content')

      // Step 2: Checksum — SHA-256 for deduplication
      const checksum = this.computeChecksum(fileContent)
      this.emitProgress(documentId, 'checksum', 2, `Checksum: ${checksum.slice(0, 12)}...`)

      // Check if document with same checksum already exists
      const existingByChecksum = await this.prisma.knowledgeDocument.findFirst({
        where: { checksum, userId },
      })
      if (existingByChecksum && existingByChecksum.syncStatus === 'INDEXED' && !options?.forceReprocess) {
        this.emitProgress(documentId, 'checksum', 2, `Duplicate detected — already indexed as ${existingByChecksum.id}`)
        return {
          documentId: existingByChecksum.id,
          clientId: existingByChecksum.clientId,
          docType: (existingByChecksum.docType as DocType) ?? 'GENERAL',
          chunkCount: existingByChecksum.chunkCount ?? 0,
          entityCount: existingByChecksum.entityCount ?? 0,
          conflicts: [],
          durationMs: Date.now() - startTime,
          status: 'INDEXED',
        }
      }

      // forceReprocess: delete old chunks so storeChunks() starts clean
      if (options?.forceReprocess && existingByChecksum) {
        await this.prisma.documentChunk.deleteMany({ where: { documentId: existingByChecksum.id } })
        this.emitProgress(documentId, 'checksum', 2, `Force reprocess — cleared ${existingByChecksum.chunkCount ?? 0} existing chunks`)
      }

      // Step 3: Attribute — determine which client this document belongs to
      if (!clientId) {
        const knownClients = await this.prisma.client.findMany({
          where: { userId },
          select: { id: true, name: true, industry: true },
        })

        const attribution = await this.discovery.attributeFile(
          {
            fileId: options?.sourceId ?? documentId,
            name: filename,
            mimeType,
            parentFolders: options?.sourcePath ? [options.sourcePath] : [],
            owners: [],
            modifiedTime: new Date().toISOString(),
            size: fileContent.length,
          },
          knownClients.map((c) => ({ id: c.id, name: c.name, industry: c.industry ?? '', aliases: [] })),
          fileContent.toString('utf-8').slice(0, 500)
        )
        clientId = attribution.clientId
        this.emitProgress(documentId, 'attribute', 3,
          `Attributed to: ${attribution.clientName ?? 'unattributed'} (${attribution.method}, ${Math.round(attribution.confidence * 100)}%)`
        )
      } else {
        this.emitProgress(documentId, 'attribute', 3, `Client provided: ${clientId}`)
      }

      // Step 4: Parse — extract text and structure
      const parser = getParser(mimeType)
      if (!parser) {
        throw new Error(`Unsupported MIME type: ${mimeType}`)
      }
      const parsed: ParsedDocument = await parser.parse(fileContent, filename)
      this.emitProgress(documentId, 'parse', 4,
        `Parsed: ${parsed.metadata.wordCount} words, ${parsed.sections.length} sections`
      )

      // Step 4.5: Chart extraction (CIM mode only — gated by enableChartExtraction flag)
      // Renders low-text PDF pages to PNG and sends to Claude vision.
      // Standard uploads are completely unaffected.
      if (options?.enableChartExtraction && mimeType === 'application/pdf') {
        try {
          const chartPages = await extractChartPages(fileContent, this.engine)
          if (chartPages.length > 0) {
            for (const { pageNumber, description } of chartPages) {
              parsed.sections.push({
                title: `Chart — Page ${pageNumber}`,
                content: `[CHART p.${pageNumber}] ${description}`,
                level: 2,
                order: parsed.sections.length,
              })
            }
            this.emitProgress(documentId, 'chart_extraction', 4.5,
              `Extracted ${chartPages.length} chart/figure descriptions from visual pages`
            )
          }
        } catch (err) {
          // Non-fatal — chart extraction failure must never break the main pipeline
          console.warn('[Pipeline] Chart extraction failed, continuing without it:', err instanceof Error ? err.message : err)
        }
      }

      // Step 5: Classify — determine document type from parser signals + model
      docType = await this.classifyDocument(parsed, filename)
      this.emitProgress(documentId, 'classify', 5, `Classified as: ${docType}`)

      // Step 6: Chunk — split into 400–600 token chunks with 50-token overlap
      const chunks = this.chunkDocument(parsed)
      chunkCount = chunks.length
      this.emitProgress(documentId, 'chunk', 6,
        `Chunked into ${chunkCount} pieces (target: ${CHUNK_TARGET_TOKENS} tokens)`
      )

      // Step 7a: Create document record first (chunks reference it via foreign key)
      await this.updateRecords(documentId, {
        userId,
        clientId,
        dealId: options?.dealId ?? null,
        title: parsed.metadata.title || filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
        sourceType,
        sourcePath: options?.sourcePath ?? null,
        sourceId: options?.sourceId ?? null,
        mimeType,
        docType,
        checksum,
        chunkCount,
        entityCount,
      })

      // Step 6.5: Contextual Retrieval — prepend context to each chunk using Claude
      const contextualizedChunks = await this.addContextualRetrieval(chunks, parsed)
      this.emitProgress(documentId, 'contextual_retrieval', 6.5,
        `Added contextual context to ${contextualizedChunks.length} chunks`
      )

      // Step 7: Embed — generate embeddings via Voyage AI
      const embeddings = await this.embedChunks(contextualizedChunks)
      this.emitProgress(documentId, 'embed', 7,
        `Generated ${embeddings.length} embeddings (${embeddings[0]?.length ?? 0} dimensions)`
      )

      // Step 8: Store chunks — save to PostgreSQL via Prisma with embeddings
      await this.storeChunks(documentId, contextualizedChunks, embeddings)
      this.emitProgress(documentId, 'store_chunks', 8,
        `Stored ${chunkCount} chunks in database`
      )

      // Step 9: Extract entities — use model to pull structured entities
      const entities = await this.extractEntities(chunks, documentId)
      entityCount = entities.length
      this.emitProgress(documentId, 'extract_entities', 9,
        `Extracted ${entityCount} entities`
      )

      // Step 10: Verify entities — use Claude Haiku to verify medium-confidence entities
      const verifiedEntities = await this.verifyEntities(entities)
      this.emitProgress(documentId, 'verify_entities', 10,
        `Verified ${verifiedEntities.length} entities`
      )

      // Step 11: Conflict detection — check Neo4j if available
      const detected = await this.detectConflicts(verifiedEntities, documentId)
      conflicts.push(...detected)
      this.emitProgress(documentId, 'conflict_detect', 11,
        conflicts.length > 0
          ? `Found ${conflicts.length} conflict(s)`
          : 'No conflicts detected'
      )

      // Step 11.5: Persist verified entities to Neo4j knowledge graph
      if (clientId && verifiedEntities.length > 0) {
        await this.storeEntitiesToGraph(verifiedEntities, documentId, clientId)
        this.emitProgress(documentId, 'store_entities', 11.5,
          `Stored ${verifiedEntities.length} entities to knowledge graph`
        )
      }

      // Step 12: Update records — create/update KnowledgeDocument in Prisma
      const rawTitle = (parsed.metadata.title ?? '').trim()
      const isUsableTitle = rawTitle.length > 0 && rawTitle.toLowerCase() !== '(anonymous)'
      const resolvedTitle = isUsableTitle
        ? rawTitle
        : filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
      await this.updateRecords(documentId, {
        userId,
        clientId,
        dealId: options?.dealId ?? null,
        title: resolvedTitle,
        sourceType,
        sourcePath: options?.sourcePath ?? null,
        sourceId: options?.sourceId ?? null,
        mimeType,
        docType,
        checksum,
        chunkCount,
        entityCount,
      })
      this.emitProgress(documentId, 'update_records', 12, 'Document record saved')

      // Step 13: Episodic memory — non-critical, must not fail the whole ingest
      try {
        await this.storeEpisodicMemory(documentId, userId, clientId, parsed, docType)
        this.emitProgress(documentId, 'episodic_memory', 13, 'Episodic memory created')
      } catch (err) {
        console.warn(`[Pipeline] Step 13 (episodic_memory) failed non-fatally: ${err instanceof Error ? err.message : 'Unknown'}`)
        this.emitProgress(documentId, 'episodic_memory', 13, 'Episodic memory skipped')
      }

      // Step 14: Publish event — non-critical
      try {
        await this.publishEvent(documentId, userId, clientId, docType, chunkCount, entityCount)
        this.emitProgress(documentId, 'publish_event', 14, 'Ingestion event logged')
      } catch (err) {
        console.warn(`[Pipeline] Step 14 (publish_event) failed non-fatally: ${err instanceof Error ? err.message : 'Unknown'}`)
      }

      // Step 15: Finalise
      this.emitProgress(documentId, 'finalise', 15, 'Ingestion complete')

      return {
        documentId,
        clientId,
        docType,
        chunkCount,
        entityCount,
        conflicts,
        durationMs: Date.now() - startTime,
        status: conflicts.length > 0 ? 'CONFLICT' : 'INDEXED',
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      this.emitProgress(documentId, 'error', 0, `Ingestion failed: ${errorMsg}`)

      return {
        documentId,
        clientId,
        docType,
        chunkCount,
        entityCount,
        conflicts,
        durationMs: Date.now() - startTime,
        status: 'FAILED',
      }
    }
  }

  // ─── Step implementations ───────────────────────────────────────

  /** Step 2: Compute SHA-256 checksum */
  private computeChecksum(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex')
  }

  /** Step 5: Classify document type using parser signals and optionally model */
  private async classifyDocument(parsed: ParsedDocument, filename: string): Promise<DocType> {
    const topSignal = parsed.typeSignals
      .sort((a, b) => b.confidence - a.confidence)[0]

    if (topSignal && topSignal.confidence >= 0.8) {
      return topSignal.docType
    }

    try {
      const response = await this.engine.route('classify', {
        systemPromptKey: 'DOC_TYPE_DETECT',
        messages: [{
          role: 'user',
          content: `Classify this document into one type. Reply with just the type name.
Types: MEETING_TRANSCRIPT, PROPOSAL, CONTRACT, REPORT, PRESENTATION, SPREADSHEET, EMAIL_THREAD, PROCESS_DOC, COMPETITIVE_INTEL, STAKEHOLDER_MAP, TECHNICAL_SPEC, GENERAL

Filename: ${filename}
Parser signals: ${parsed.typeSignals.map((s) => `${s.docType}(${s.confidence})`).join(', ')}
Preview: ${parsed.text.slice(0, 300)}`,
        }],
        maxTokens: 20,
      })

      const text = response.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z_]/g, '')

      const validTypes: DocType[] = [
        'MEETING_TRANSCRIPT', 'PROPOSAL', 'CONTRACT', 'REPORT', 'PRESENTATION',
        'SPREADSHEET', 'EMAIL_THREAD', 'PROCESS_DOC', 'COMPETITIVE_INTEL',
        'STAKEHOLDER_MAP', 'TECHNICAL_SPEC', 'GENERAL',
      ]

      if (validTypes.includes(text as DocType)) {
        return text as DocType
      }
    } catch {
      // Classification failed, use parser signal
    }

    return topSignal?.docType ?? 'GENERAL'
  }

  /** Step 6: Split document into chunks with overlap */
  private chunkDocument(parsed: ParsedDocument): DocumentChunk[] {
    return chunkDocumentImpl(parsed)
  }

  /**
   * Step 6.5: Add contextual prefixes to chunks using Claude Haiku.
   *
   * Batches up to 20 chunks per API call (was 1 call per chunk).
   * Each batch asks Haiku to emit one context sentence per chunk, in order,
   * separated by the delimiter "---CHUNK_CTX---". This reduces N API calls
   * to ceil(N/20) calls — a ~20× reduction for typical documents.
   */
  private async addContextualRetrieval(chunks: DocumentChunk[], parsed: ParsedDocument): Promise<DocumentChunk[]> {
    const BATCH_SIZE = 20
    const docTitle = parsed.metadata.title
    const docExcerpt = parsed.text.slice(0, 2000)
    const DELIMITER = '---CHUNK_CTX---'

    const contextualizedChunks: DocumentChunk[] = []

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE)

      let contexts: string[] = batch.map(() => '') // default to empty context

      try {
        const chunksListing = batch
          .map((c, idx) => `[${idx + 1}] ${c.content.slice(0, 500)}`)
          .join('\n\n')

        const response = await this.engine.route('contextual_retrieval', {
          systemPromptKey: 'ENTITY_EXTRACT_RAW',
          messages: [{
            role: 'user',
            content: `Document title: "${docTitle}"
Document excerpt: ${docExcerpt}

For each numbered chunk below, write exactly one sentence describing its context within the document. Output ONLY the ${batch.length} sentences, separated by "${DELIMITER}" — no numbering, no extra text.

${chunksListing}`,
          }],
          maxTokens: batch.length * 120,
        })

        const text = response.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('')
          .trim()

        const parts = text.split(DELIMITER).map((s) => s.trim())
        // Only use parts if count matches; otherwise fall through to empty contexts
        if (parts.length === batch.length) {
          contexts = parts
        }
      } catch (err) {
        console.warn(`[Pipeline] Contextual retrieval batch ${i}–${i + batch.length} failed: ${err instanceof Error ? err.message : 'Unknown'}`)
      }

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j]!
        const ctx = contexts[j] ?? ''
        const prependedContent = ctx ? `${ctx}\n\n${chunk.content}` : chunk.content
        contextualizedChunks.push({
          ...chunk,
          content: prependedContent,
          tokens: estimateTokens(prependedContent),
        })
      }
    }

    return contextualizedChunks
  }

  /** Step 7: Generate embeddings via Voyage AI in batches of 50 */
  private async embedChunks(chunks: DocumentChunk[]): Promise<number[][]> {
    const voyageKey = process.env['VOYAGE_API_KEY']
    if (!voyageKey) {
      console.warn('[Pipeline] VOYAGE_API_KEY not set — using zero vectors')
      return chunks.map(() => new Array(1024).fill(0) as number[])
    }

    const embeddings: number[][] = []
    const BATCH_SIZE = 50

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE)
      const texts = batch.map((c) => c.content)

      try {
        const response = await fetch('https://api.voyageai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${voyageKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: texts,
            model: 'voyage-3-lite',
            input_type: 'document',
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`[Pipeline] Voyage AI error ${response.status}: ${errorText}`)
          for (const _t of texts) {
            embeddings.push(new Array(1024).fill(0) as number[])
          }
          continue
        }

        const data = await response.json() as {
          data: Array<{ embedding: number[] }>
          usage: { total_tokens: number }
        }

        for (const item of data.data) {
          embeddings.push(item.embedding)
        }

        console.log(`[Pipeline] Voyage AI: embedded batch ${Math.floor(i / BATCH_SIZE) + 1}, ${data.usage.total_tokens} tokens`)
      } catch (err) {
        console.error(`[Pipeline] Voyage AI failed: ${err instanceof Error ? err.message : 'Unknown'}`)
        for (const _t of texts) {
          embeddings.push(new Array(1024).fill(0) as number[])
        }
      }
    }

    return embeddings
  }

  /** Step 8: Store chunks in PostgreSQL via Prisma with embeddings */
  private async storeChunks(
    documentId: string,
    chunks: DocumentChunk[],
    embeddings: number[][]
  ): Promise<void> {
    // Delete any existing chunks for this document (re-ingestion)
    await this.prisma.documentChunk.deleteMany({
      where: { documentId },
    })

    // Batch-insert all chunks in a single round trip and get back their IDs
    const created = await this.prisma.documentChunk.createManyAndReturn({
      data: chunks.map((chunk) => ({
        documentId,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        tokens: chunk.tokens,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        metadata: JSON.parse(JSON.stringify(chunk.metadata)),
      })),
    })

    // Batch-update embeddings in a single round trip using unnest
    // Only update rows that have a real (non-zero) embedding
    const ids: string[] = []
    const vectors: string[] = []

    for (let i = 0; i < created.length; i++) {
      const row = created[i]
      const embedding = embeddings[i]
      if (row && embedding && embedding.some((v) => v !== 0)) {
        ids.push(row.id)
        vectors.push(`[${embedding.join(',')}]`)
      }
    }

    if (ids.length > 0) {
      // Use unnest to update all embeddings in one SQL statement.
      // IDs are text cuids — must use text[] not uuid[] to avoid operator type mismatch.
      await this.prisma.$executeRawUnsafe(
        `UPDATE document_chunks
         SET embedding = v.vec::vector
         FROM (SELECT unnest($1::text[]) AS id, unnest($2::text[]) AS vec) AS v
         WHERE document_chunks.id = v.id`,
        ids,
        vectors
      )
    }
  }

  /** Step 9: Extract entities from chunks using model */
  private async extractEntities(
    chunks: DocumentChunk[],
    _documentId: string
  ): Promise<ExtractedEntity[]> {
    const entities: ExtractedEntity[] = []
    // Limit to first 3 chunk groups to avoid excessive API calls
    const limitedChunks = chunks.slice(0, 15)
    const chunkGroups = this.groupChunks(limitedChunks, 5)

    for (const group of chunkGroups) {
      const combinedText = group.map((c) => c.content).join('\n\n')

      try {
        const response = await this.engine.route('entity_extract', {
          systemPromptKey: 'ENTITY_EXTRACT_RAW',
          messages: [{
            role: 'user',
            content: `Extract named entities from this text. Return a JSON array of objects with: name, type (CLIENT|COMPETITOR|TECHNOLOGY|PERSON|PROCESS|INDUSTRY|CONCEPT), properties (key-value pairs), confidence (0-1).

Text:
${combinedText.slice(0, 3000)}`,
          }],
          maxTokens: 1500,
        })

        const rawText = response.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('')

        // Strip Qwen3 <think>...</think> reasoning blocks before parsing
        const text = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

        type RawEntity = {
          name: string
          type: string
          properties: Record<string, unknown>
          confidence: number
        }

        // Qwen3 with format:'json' returns an object (often {"entities":[...]}),
        // but can also return a bare array. Handle both shapes.
        let parsedEntities: RawEntity[] | null = null
        const objectMatch = text.match(/\{[\s\S]*\}/)
        const arrayMatch = text.match(/\[[\s\S]*\]/)

        if (objectMatch?.[0]) {
          try {
            const obj = JSON.parse(objectMatch[0]) as Record<string, unknown>
            const candidateKeys = ['entities', 'items', 'results', 'data']
            for (const key of candidateKeys) {
              if (Array.isArray(obj[key])) {
                parsedEntities = obj[key] as RawEntity[]
                break
              }
            }
            if (!parsedEntities) {
              for (const value of Object.values(obj)) {
                if (Array.isArray(value)) {
                  parsedEntities = value as RawEntity[]
                  break
                }
              }
            }
          } catch {
            // fall through to bare-array parse
          }
        }

        if (!parsedEntities && arrayMatch?.[0]) {
          try {
            parsedEntities = JSON.parse(arrayMatch[0]) as RawEntity[]
          } catch {
            parsedEntities = null
          }
        }

        if (parsedEntities && Array.isArray(parsedEntities)) {
          for (const entity of parsedEntities) {
            if (!entity || typeof entity.name !== 'string' || !entity.name.trim()) continue
            entities.push({
              name: entity.name,
              type: entity.type as ExtractedEntity['type'],
              properties: entity.properties ?? {},
              confidence: entity.confidence ?? 0.5,
              sourceChunkIndex: group[0]?.chunkIndex ?? 0,
            })
          }
        }
      } catch (err) {
        console.warn(`[Pipeline] Entity extraction failed for chunk group: ${err instanceof Error ? err.message : 'Unknown'}`)
      }
    }

    return entities
  }

  /** Step 10: Verify high-impact entities using Claude Haiku */
  private async verifyEntities(
    entities: ExtractedEntity[]
  ): Promise<ExtractedEntity[]> {
    const verified: ExtractedEntity[] = []

    for (const entity of entities) {
      if (entity.confidence >= 0.8) {
        verified.push(entity)
        continue
      }
      if (entity.confidence < 0.4) {
        continue
      }

      try {
        const response = await this.engine.route('entity_verify', {
          systemPromptKey: 'ENTITY_VERIFY',
          messages: [{
            role: 'user',
            content: `Is this a valid entity? Reply YES or NO.
Name: ${entity.name}
Type: ${entity.type}
Properties: ${JSON.stringify(entity.properties)}`,
          }],
          maxTokens: 10,
        })

        const text = response.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('')
          .trim()
          .toUpperCase()

        if (text.includes('YES')) {
          verified.push({ ...entity, confidence: Math.min(entity.confidence + 0.2, 1.0) })
        }
      } catch {
        verified.push(entity)
      }
    }

    return verified
  }

  /** Step 11.5: Persist verified entities to the Neo4j knowledge graph */
  private async storeEntitiesToGraph(
    entities: ExtractedEntity[],
    documentId: string,
    clientId: string
  ): Promise<void> {
    const ENTITY_TYPE_TO_LABEL: Record<string, NodeLabel> = {
      CLIENT: 'Client',
      COMPETITOR: 'Competitor',
      TECHNOLOGY: 'Technology',
      PERSON: 'Person',
      PROCESS: 'Process',
      INDUSTRY: 'Industry',
      CONCEPT: 'Concept',
    }

    try {
      const { Neo4jClient, GraphOperations } = await import('@axis/knowledge-graph')
      const neo4jClient = new Neo4jClient()

      if (!neo4jClient.isAvailable()) {
        console.warn('[Pipeline] Neo4j unavailable — skipping entity storage')
        return
      }

      const graphOps = new GraphOperations(neo4jClient)

      for (const entity of entities) {
        const label = ENTITY_TYPE_TO_LABEL[entity.type]
        if (!label) continue

        // Deterministic ID: stable across re-ingestion
        const normalised = entity.name.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const nodeId = `${clientId}_${entity.type.toLowerCase()}_${normalised}`

        try {
          await graphOps.upsertNode(label, {
            id: nodeId,
            clientId,
            name: entity.name,
            sourceDocIds: [documentId],
            ...entity.properties,
          })
          // Connect entity to its client — Client node has id = clientId (no prefix).
          // Prevents orphaned nodes on every future ingestion.
          await graphOps.upsertRelationship('PART_OF', { fromId: nodeId, toId: clientId })
        } catch (nodeErr) {
          console.warn(`[Pipeline] Failed to upsert entity "${entity.name}": ${nodeErr instanceof Error ? nodeErr.message : 'Unknown'}`)
        }
      }

      await neo4jClient.close()
    } catch {
      console.warn('[Pipeline] Neo4j entity storage failed — continuing without graph')
    }
  }

  /** Step 11: Detect conflicts with existing graph data */
  private async detectConflicts(
    entities: ExtractedEntity[],
    _documentId: string
  ): Promise<ConflictDetected[]> {
    const conflicts: ConflictDetected[] = []

    try {
      const { Neo4jClient, GraphOperations } = await import('@axis/knowledge-graph')
      const neo4jClient = new Neo4jClient()

      if (!neo4jClient.isAvailable()) {
        console.warn('[Pipeline] Neo4j unavailable — skipping conflict detection')
        return conflicts
      }

      const graphOps = new GraphOperations(neo4jClient)

      for (const entity of entities) {
        try {
          const existing = await graphOps.findRelated(entity.name, 1)
          if (!existing) continue

          // Compare properties for contradictions
          // GraphNode types have specific typed fields, cast to record for comparison
          const existingRecord = existing.node as unknown as Record<string, unknown>
          for (const [key, newValue] of Object.entries(entity.properties)) {
            const existingValue = existingRecord[key]
            if (existingValue !== undefined && existingValue !== null && String(existingValue) !== String(newValue)) {
              conflicts.push({
                entityName: entity.name,
                entityType: entity.type,
                property: key,
                existingValue: String(existingValue),
                newValue: String(newValue),
                existingSourceDocId: 'graph',
                newSourceDocId: _documentId,
              })
            }
          }
        } catch {
          // Individual entity check failed — continue
        }
      }
    } catch {
      console.warn('[Pipeline] Neo4j import failed — skipping conflict detection')
    }

    return conflicts
  }

  /** Step 12: Create/update KnowledgeDocument record in Prisma */
  private async updateRecords(
    documentId: string,
    data: {
      userId: string
      clientId: string | null
      dealId: string | null
      title: string
      sourceType: SourceType
      sourcePath: string | null
      sourceId: string | null
      mimeType: string
      docType: DocType
      checksum: string
      chunkCount: number
      entityCount: number
    }
  ): Promise<void> {
    await this.prisma.knowledgeDocument.upsert({
      where: { id: documentId },
      create: {
        id: documentId,
        userId: data.userId,
        ...(data.clientId ? { clientId: data.clientId } : {}),
        ...(data.dealId ? { dealId: data.dealId } : {}),
        title: data.title,
        sourceType: data.sourceType as 'GDRIVE' | 'UPLOAD' | 'WEB' | 'MANUAL',
        sourcePath: data.sourcePath,
        sourceId: data.sourceId,
        mimeType: data.mimeType,
        docType: data.docType,
        checksum: data.checksum,
        syncStatus: 'INDEXED',
        chunkCount: data.chunkCount,
        entityCount: data.entityCount,
        lastSynced: new Date(),
      },
      update: {
        ...(data.clientId ? { clientId: data.clientId } : {}),
        ...(data.dealId ? { dealId: data.dealId } : {}),
        title: data.title,
        docType: data.docType,
        checksum: data.checksum,
        syncStatus: 'INDEXED',
        chunkCount: data.chunkCount,
        entityCount: data.entityCount,
        lastSynced: new Date(),
      },
    })
  }

  /** Step 13: Store episodic memory for agent context */
  private async storeEpisodicMemory(
    documentId: string,
    userId: string,
    clientId: string | null,
    parsed: ParsedDocument,
    docType: DocType
  ): Promise<void> {
    const title = parsed.metadata.title?.trim() || 'untitled'
    const topics = parsed.sections.slice(0, 5).map((s) => s.title).filter(Boolean).join(', ') || 'untitled sections'
    const tags = [docType, title, documentId].filter((t): t is string => typeof t === 'string' && t.length > 0)

    await this.prisma.agentMemory.create({
      data: {
        userId,
        ...(clientId ? { clientId } : {}),
        memoryType: 'EPISODIC',
        content: `Ingested ${docType} document: "${title}" (${parsed.metadata.wordCount} words, ${documentId}). Key topics: ${topics}.`,
        tags,
      },
    })
  }

  /** Step 14: Publish ingestion completion event via Redis pub/sub */
  private async publishEvent(
    documentId: string,
    userId: string,
    clientId: string | null,
    docType: DocType,
    chunkCount: number,
    entityCount: number
  ): Promise<void> {
    const payload = JSON.stringify({
      documentId,
      userId,
      clientId,
      docType,
      chunkCount,
      entityCount,
      timestamp: new Date().toISOString(),
    })

    if (this.redis) {
      try {
        await this.redis.publish(INGESTION_CHANNEL, payload)
      } catch {
        // Non-critical — pipeline continues even if event publish fails
      }
    }
  }

  /** Emit progress event to the onProgress callback */
  private emitProgress(
    documentId: string,
    step: string,
    stepNumber: number,
    message: string
  ): void {
    if (!this.onProgress) return
    this.onProgress({
      documentId,
      step,
      stepNumber,
      totalSteps: TOTAL_STEPS,
      status: stepNumber === 0 ? 'failed' : stepNumber === TOTAL_STEPS ? 'completed' : 'running',
      message,
      timestamp: new Date().toISOString(),
    })
  }

  /** Generate a unique document ID */
  private generateId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(2, 9)
    return `doc_${timestamp}_${random}`
  }

  /** Split an array into groups of at most `size` items */
  private groupChunks<T>(items: T[], size: number): T[][] {
    const groups: T[][] = []
    for (let i = 0; i < items.length; i += size) {
      groups.push(items.slice(i, i + size))
    }
    return groups
  }
}
