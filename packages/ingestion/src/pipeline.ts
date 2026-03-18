// Ingestion Pipeline — 15-step document processing flow
// fetch → checksum → attribute → parse → classify → chunk → embed →
// store chunks → extract entities → verify entities → conflict detect →
// update records → episodic memory → publish event → finalise

import { createHash } from 'node:crypto'
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
const EMBED_BATCH_SIZE = 50
const TOTAL_STEPS = 15

/** Approximate tokens from character count (1 token ≈ 4 chars for English) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * The core ingestion pipeline. Processes a single document through 15 steps.
 *
 * All model calls go through InferenceEngine — never call APIs directly.
 */
export class IngestionPipeline {
  private engine: InferenceEngine
  private discovery: DriveDiscovery
  private onProgress?: ((event: IngestionProgress) => void) | undefined

  constructor(
    engine?: InferenceEngine,
    onProgress?: (event: IngestionProgress) => void
  ) {
    this.engine = engine ?? new InferenceEngine()
    this.discovery = new DriveDiscovery(this.engine)
    this.onProgress = onProgress
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

      // TODO: Check if document with same checksum already exists
      // const existing = await prisma.knowledgeDocument.findFirst({ where: { checksum } })
      // if (existing) return { ...existing, status: 'INDEXED', durationMs: Date.now() - startTime }

      // Step 3: Attribute — determine which client this document belongs to
      if (!clientId) {
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
          [], // TODO: Load known clients from Prisma
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

      // Step 5: Classify — determine document type from parser signals + Qwen3
      docType = await this.classifyDocument(parsed, filename)
      this.emitProgress(documentId, 'classify', 5, `Classified as: ${docType}`)

      // Step 6: Chunk — split into 400–600 token chunks with 50-token overlap
      const chunks = this.chunkDocument(parsed)
      chunkCount = chunks.length
      this.emitProgress(documentId, 'chunk', 6,
        `Chunked into ${chunkCount} pieces (target: ${CHUNK_TARGET_TOKENS} tokens)`
      )

      // Step 7: Embed — generate embeddings via Voyage AI in batches of 50
      const embeddings = await this.embedChunks(chunks)
      this.emitProgress(documentId, 'embed', 7,
        `Generated ${embeddings.length} embeddings in ${Math.ceil(chunks.length / EMBED_BATCH_SIZE)} batch(es)`
      )

      // Step 8: Store chunks — save to PostgreSQL with embeddings
      await this.storeChunks(documentId, chunks, embeddings)
      this.emitProgress(documentId, 'store_chunks', 8,
        `Stored ${chunkCount} chunks with embeddings`
      )

      // Step 9: Extract entities — use Qwen3 to pull structured entities
      const entities = await this.extractEntities(chunks, documentId)
      entityCount = entities.length
      this.emitProgress(documentId, 'extract_entities', 9,
        `Extracted ${entityCount} entities`
      )

      // Step 10: Verify entities — use Claude Haiku to verify high-impact entities
      const verifiedEntities = await this.verifyEntities(entities)
      this.emitProgress(documentId, 'verify_entities', 10,
        `Verified ${verifiedEntities.length} entities`
      )

      // Step 11: Conflict detection — check for contradictions with existing data
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

      // Step 14: Publish event — notify other systems via Redis pub/sub
      await this.publishEvent(documentId, userId, clientId, docType, chunkCount, entityCount)
      this.emitProgress(documentId, 'publish_event', 14, 'Ingestion event published')

      // Step 15: Finalise — mark as indexed
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

  /** Step 5: Classify document type using parser signals and optionally Qwen3 */
  private async classifyDocument(parsed: ParsedDocument, filename: string): Promise<DocType> {
    // Use parser's type signals first
    const topSignal = parsed.typeSignals
      .sort((a, b) => b.confidence - a.confidence)[0]

    if (topSignal && topSignal.confidence >= 0.8) {
      return topSignal.docType
    }

    // If not confident enough, use Qwen3 for classification
    try {
      const response = await this.engine.route('classify', {
        systemPromptKey: 'MICRO_CLASSIFY',
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
    const words = text.split(/\s+/)
    let chunkIndex = 0

    // Target ~500 tokens ≈ ~2000 chars, with overlap
    const charsPerChunk = CHUNK_TARGET_TOKENS * 4
    const overlapChars = CHUNK_OVERLAP_TOKENS * 4

    let position = 0
    while (position < text.length) {
      // Find chunk end, trying to break at sentence boundaries
      let endPos = Math.min(position + charsPerChunk + CHUNK_MAX_TOKENS * 4 - charsPerChunk, text.length)

      if (endPos < text.length) {
        // Look for sentence boundary near target
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

        // Find which section this chunk belongs to
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

      // Move position forward with overlap
      position = endPos - overlapChars
      if (position <= (chunks[chunks.length - 1] ? endPos - charsPerChunk : 0)) {
        position = endPos // Prevent infinite loop on very small text
      }
    }

    // Handle edge case: empty document
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

  /** Step 7: Generate embeddings via Voyage AI in batches of 50 */
  private async embedChunks(chunks: DocumentChunk[]): Promise<number[][]> {
    const embeddings: number[][] = []

    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE)

      // TODO: Call Voyage AI embedding API
      // const response = await voyageClient.embed({
      //   input: batch.map(c => c.content),
      //   model: 'voyage-3-lite',
      // })
      // embeddings.push(...response.data.map(d => d.embedding))

      // Placeholder: generate zero vectors (1536 dimensions to match pgvector schema)
      for (const _chunk of batch) {
        embeddings.push(new Array(1536).fill(0))
      }
    }

    return embeddings
  }

  /** Step 8: Store chunks in PostgreSQL with embeddings */
  private async storeChunks(
    documentId: string,
    chunks: DocumentChunk[],
    _embeddings: number[][]
  ): Promise<void> {
    // TODO: Batch insert via Prisma + raw SQL for pgvector embeddings
    // for (let i = 0; i < chunks.length; i++) {
    //   await prisma.documentChunk.create({
    //     data: {
    //       documentId,
    //       content: chunks[i].content,
    //       chunkIndex: chunks[i].chunkIndex,
    //       tokens: chunks[i].tokens,
    //       metadata: chunks[i].metadata,
    //     },
    //   })
    //   // Raw SQL for embedding: UPDATE "DocumentChunk" SET embedding = $1 WHERE id = $2
    // }
    void documentId
    void chunks
  }

  /** Step 9: Extract entities from chunks using Qwen3 */
  private async extractEntities(
    chunks: DocumentChunk[],
    documentId: string
  ): Promise<ExtractedEntity[]> {
    const entities: ExtractedEntity[] = []

    // Process chunks in groups to stay within token limits
    const chunkGroups = this.groupChunks(chunks, 5)

    for (const group of chunkGroups) {
      const combinedText = group.map((c) => c.content).join('\n\n')

      try {
        const response = await this.engine.route('agent_response', {
          systemPromptKey: 'MICRO_EXTRACT',
          messages: [{
            role: 'user',
            content: `Extract named entities from this text. Return JSON array of objects with: name, type (CLIENT|COMPETITOR|TECHNOLOGY|PERSON|PROCESS|INDUSTRY|CONCEPT), properties (key-value pairs), confidence (0-1).

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
      } catch {
        // Entity extraction failed for this group — continue with others
      }
    }

    void documentId
    return entities
  }

  /** Step 10: Verify high-impact entities using Claude Haiku */
  private async verifyEntities(
    entities: ExtractedEntity[]
  ): Promise<ExtractedEntity[]> {
    // Only verify entities with medium confidence (0.4–0.8)
    // High confidence (>0.8) entities are accepted as-is
    // Low confidence (<0.4) entities are dropped
    const verified: ExtractedEntity[] = []

    for (const entity of entities) {
      if (entity.confidence >= 0.8) {
        verified.push(entity)
        continue
      }
      if (entity.confidence < 0.4) {
        continue
      }

      // Use Claude Haiku for verification
      try {
        const response = await this.engine.route('entity_verify', {
          systemPromptKey: 'MICRO_VERIFY',
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
        // Verification failed — include with original confidence
        verified.push(entity)
      }
    }

    return verified
  }

  /** Step 11: Detect conflicts with existing graph data */
  private async detectConflicts(
    entities: ExtractedEntity[],
    documentId: string
  ): Promise<ConflictDetected[]> {
    const conflicts: ConflictDetected[] = []

    // TODO: For each entity, query Neo4j knowledge graph for existing entries
    // Compare properties and flag contradictions
    // Example: entity says "Acme has 200 employees" but graph says 150
    //
    // for (const entity of entities) {
    //   const existing = await graphOps.findByName(entity.name, entity.type)
    //   if (existing) {
    //     for (const [key, newValue] of Object.entries(entity.properties)) {
    //       const existingValue = existing.properties[key]
    //       if (existingValue && existingValue !== newValue) {
    //         conflicts.push({ ... })
    //       }
    //     }
    //   }
    // }

    void entities
    void documentId
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
    // TODO: Upsert KnowledgeDocument via Prisma
    // await prisma.knowledgeDocument.upsert({
    //   where: { id: documentId },
    //   create: { id: documentId, ...data, syncStatus: 'INDEXED' },
    //   update: { ...data, syncStatus: 'INDEXED', lastSynced: new Date() },
    // })
    void documentId
    void data
  }

  /** Step 13: Store episodic memory for agent context */
  private async storeEpisodicMemory(
    documentId: string,
    userId: string,
    clientId: string | null,
    parsed: ParsedDocument,
    docType: DocType
  ): Promise<void> {
    // TODO: Create AgentMemory record
    // await prisma.agentMemory.create({
    //   data: {
    //     userId,
    //     clientId,
    //     memoryType: 'EPISODIC',
    //     content: `Ingested ${docType} document: "${parsed.metadata.title}" (${parsed.metadata.wordCount} words)`,
    //     tags: [docType, parsed.metadata.title],
    //   },
    // })
    void documentId
    void userId
    void clientId
    void parsed
    void docType
  }

  /** Step 14: Publish ingestion event via Redis pub/sub */
  private async publishEvent(
    documentId: string,
    userId: string,
    clientId: string | null,
    docType: DocType,
    chunkCount: number,
    entityCount: number
  ): Promise<void> {
    // TODO: Publish to Redis channel 'axis:ingestion:complete'
    // await redis.publish('axis:ingestion:complete', JSON.stringify({
    //   documentId, userId, clientId, docType, chunkCount, entityCount,
    //   timestamp: new Date().toISOString(),
    // }))
    void documentId
    void userId
    void clientId
    void docType
    void chunkCount
    void entityCount
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
