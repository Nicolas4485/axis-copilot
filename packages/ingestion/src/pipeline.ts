// Ingestion Pipeline — 15-step document processing flow
// fetch → checksum → attribute → parse → classify → chunk → embed →
// store chunks → extract entities → verify entities → conflict detect →
// update records → episodic memory → publish event → finalise

import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { InferenceEngine } from '@axis/inference'
import { getParser } from './parsers/index.js'
import { DriveDiscovery } from './drive-discovery.js'
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
 * The core ingestion pipeline. Processes a single document through 15 steps.
 *
 * All model calls go through InferenceEngine — never call APIs directly.
 * All persistence goes through Prisma — no database-agnostic abstractions.
 */
export class IngestionPipeline {
  private engine: InferenceEngine
  private discovery: DriveDiscovery
  private prisma: PrismaClient
  private onProgress?: ((event: IngestionProgress) => void) | undefined

  constructor(options?: {
    engine?: InferenceEngine
    prisma?: PrismaClient
    onProgress?: (event: IngestionProgress) => void
  }) {
    if (!options?.prisma) {
      throw new Error('IngestionPipeline requires a PrismaClient instance. Pass it via { prisma } in the constructor.')
    }
    this.engine = options.engine ?? new InferenceEngine()
    this.prisma = options.prisma
    this.discovery = new DriveDiscovery(this.engine)
    this.onProgress = options.onProgress
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
      sourceType?: SourceType
      sourceId?: string
      sourcePath?: string
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
      if (existingByChecksum && existingByChecksum.syncStatus === 'INDEXED') {
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

      // Step 5: Classify — determine document type from parser signals + model
      docType = await this.classifyDocument(parsed, filename)
      this.emitProgress(documentId, 'classify', 5, `Classified as: ${docType}`)

      // Step 6: Chunk — split into 400–600 token chunks with 50-token overlap
      const chunks = this.chunkDocument(parsed)
      chunkCount = chunks.length
      this.emitProgress(documentId, 'chunk', 6,
        `Chunked into ${chunkCount} pieces (target: ${CHUNK_TARGET_TOKENS} tokens)`
      )

      // Step 7: Embed — skipped (zero vectors until Voyage AI is integrated)
      this.emitProgress(documentId, 'embed', 7,
        `Embedding skipped (Voyage AI pending) — ${chunkCount} chunks ready`
      )

      // Step 8: Store chunks — save to PostgreSQL via Prisma
      await this.storeChunks(documentId, chunks)
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

      // Step 12: Update records — create/update KnowledgeDocument in Prisma
      await this.updateRecords(documentId, {
        userId,
        clientId,
        title: parsed.metadata.title,
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

      // Step 13: Episodic memory — store ingestion event for agent memory
      await this.storeEpisodicMemory(documentId, userId, clientId, parsed, docType)
      this.emitProgress(documentId, 'episodic_memory', 13, 'Episodic memory created')

      // Step 14: Publish event — log (Redis pub/sub wired later)
      await this.publishEvent(documentId, userId, clientId, docType, chunkCount, entityCount)
      this.emitProgress(documentId, 'publish_event', 14, 'Ingestion event logged')

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
    const chunks: DocumentChunk[] = []
    const text = parsed.text

    const charsPerChunk = CHUNK_TARGET_TOKENS * 4
    const overlapChars = CHUNK_OVERLAP_TOKENS * 4

    let chunkIndex = 0
    let position = 0

    while (position < text.length) {
      let endPos = Math.min(position + charsPerChunk + (CHUNK_MAX_TOKENS - CHUNK_TARGET_TOKENS) * 4, text.length)

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
        const tokens = estimateTokens(chunkText)

        const section = parsed.sections.find((s) => {
          const sectionStart = text.indexOf(s.content)
          return sectionStart >= 0 && sectionStart <= position && position < sectionStart + s.content.length
        })

        chunks.push({
          content: chunkText,
          chunkIndex: chunkIndex++,
          tokens,
          metadata: {
            sectionTitle: section?.title,
          },
        })
      }

      position = endPos - overlapChars
      if (position <= (chunks.length > 0 ? endPos - charsPerChunk : 0)) {
        position = endPos
      }
    }

    if (chunks.length === 0 && text.trim().length > 0) {
      chunks.push({
        content: text.trim(),
        chunkIndex: 0,
        tokens: estimateTokens(text),
        metadata: {},
      })
    }

    return chunks
  }

  /** Step 8: Store chunks in PostgreSQL via Prisma */
  private async storeChunks(
    documentId: string,
    chunks: DocumentChunk[]
  ): Promise<void> {
    // Delete any existing chunks for this document (re-ingestion)
    await this.prisma.documentChunk.deleteMany({
      where: { documentId },
    })

    // Batch insert chunks via Prisma
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!
      await this.prisma.documentChunk.create({
        data: {
          documentId,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          tokens: chunk.tokens,
          metadata: JSON.parse(JSON.stringify(chunk.metadata)),
        },
      })

      // TODO: When Voyage AI embeddings are real, store via raw SQL:
      // await this.prisma.$executeRaw`
      //   UPDATE "DocumentChunk" SET embedding = ${embeddings[i]}::vector
      //   WHERE id = ${chunkId}
      // `
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
          maxTokens: 500,
        })

        const text = response.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('')

        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (jsonMatch?.[0]) {
          const parsed = JSON.parse(jsonMatch[0]) as Array<{
            name: string
            type: string
            properties: Record<string, unknown>
            confidence: number
          }>

          for (const entity of parsed) {
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
    await this.prisma.agentMemory.create({
      data: {
        userId,
        ...(clientId ? { clientId } : {}),
        memoryType: 'EPISODIC',
        content: `Ingested ${docType} document: "${parsed.metadata.title}" (${parsed.metadata.wordCount} words, ${documentId}). Key topics: ${parsed.sections.slice(0, 5).map((s) => s.title).filter(Boolean).join(', ') || 'untitled sections'}.`,
        tags: [docType, parsed.metadata.title, documentId],
      },
    })
  }

  /** Step 14: Publish ingestion event (log for now, Redis pub/sub later) */
  private async publishEvent(
    documentId: string,
    userId: string,
    clientId: string | null,
    docType: DocType,
    chunkCount: number,
    entityCount: number
  ): Promise<void> {
    // Log the event (Redis pub/sub will be wired when we add real-time updates)
    console.log(`[Pipeline] Event: document_ingested | doc=${documentId} user=${userId} client=${clientId ?? 'none'} type=${docType} chunks=${chunkCount} entities=${entityCount}`)

    // TODO: Wire Redis pub/sub
    // await redis.publish('axis:ingestion:complete', JSON.stringify({
    //   documentId, userId, clientId, docType, chunkCount, entityCount,
    //   timestamp: new Date().toISOString(),
    // }))
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private emitProgress(
    documentId: string,
    step: string,
    stepNumber: number,
    message: string
  ): void {
    const event: IngestionProgress = {
      documentId,
      step,
      stepNumber,
      totalSteps: TOTAL_STEPS,
      status: stepNumber === TOTAL_STEPS ? 'completed' : 'running',
      message,
      timestamp: new Date().toISOString(),
    }
    console.log(`[Pipeline] Step ${stepNumber}/${TOTAL_STEPS}: ${message}`)
    this.onProgress?.(event)
  }

  private generateId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  private groupChunks(chunks: DocumentChunk[], groupSize: number): DocumentChunk[][] {
    const groups: DocumentChunk[][] = []
    for (let i = 0; i < chunks.length; i += groupSize) {
      groups.push(chunks.slice(i, i + groupSize))
    }
    return groups
  }
}
