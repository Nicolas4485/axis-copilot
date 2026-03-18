// Ingestion pipeline type definitions

/** Document type classification signals */
export type DocType =
  | 'MEETING_TRANSCRIPT'
  | 'PROPOSAL'
  | 'CONTRACT'
  | 'REPORT'
  | 'PRESENTATION'
  | 'SPREADSHEET'
  | 'EMAIL_THREAD'
  | 'PROCESS_DOC'
  | 'COMPETITIVE_INTEL'
  | 'STAKEHOLDER_MAP'
  | 'TECHNICAL_SPEC'
  | 'GENERAL'

/** Structured output from any parser */
export interface ParsedDocument {
  /** Raw text content */
  text: string
  /** Structured sections if the doc has headings/slides/sheets */
  sections: ParsedSection[]
  /** Metadata extracted from the document */
  metadata: DocumentMetadata
  /** Signals for automatic doc type classification */
  typeSignals: TypeSignal[]
}

export interface ParsedSection {
  title: string
  content: string
  level: number       // heading depth: 1 = H1, 2 = H2, etc.
  order: number
}

export interface DocumentMetadata {
  title: string
  author?: string | undefined
  createdDate?: string | undefined
  modifiedDate?: string | undefined
  wordCount: number
  language?: string | undefined
  mimeType: string
  /** Parser-specific extras (e.g. slide count, sheet names) */
  extra: Record<string, unknown>
}

export interface TypeSignal {
  docType: DocType
  confidence: number   // 0.0 to 1.0
  reason: string
}

/** Source type for documents */
export type SourceType = 'GDRIVE' | 'UPLOAD' | 'WEB' | 'MANUAL'

/** Sync status for document processing */
export type SyncStatus = 'PENDING' | 'PROCESSING' | 'INDEXED' | 'FAILED' | 'CONFLICT'

/** A text chunk ready for embedding */
export interface DocumentChunk {
  content: string
  chunkIndex: number
  tokens: number
  metadata: {
    sectionTitle?: string | undefined
    pageNumber?: number | undefined
    sheetName?: string | undefined
    slideNumber?: number | undefined
  }
}

/** Entity extracted from a chunk */
export interface ExtractedEntity {
  name: string
  type: 'CLIENT' | 'COMPETITOR' | 'TECHNOLOGY' | 'PERSON' | 'PROCESS' | 'INDUSTRY' | 'CONCEPT'
  properties: Record<string, unknown>
  confidence: number
  sourceChunkIndex: number
}

/** Ingestion pipeline result */
export interface IngestionResult {
  documentId: string
  clientId: string | null
  docType: DocType
  chunkCount: number
  entityCount: number
  conflicts: ConflictDetected[]
  durationMs: number
  status: SyncStatus
}

/** A detected conflict during ingestion */
export interface ConflictDetected {
  entityName: string
  entityType: string
  property: string
  existingValue: string
  newValue: string
  existingSourceDocId: string
  newSourceDocId: string
}

/** Drive file info for discovery */
export interface DriveFileInfo {
  fileId: string
  name: string
  mimeType: string
  parentFolders: string[]
  owners: string[]
  modifiedTime: string
  size: number
}

/** Client attribution result */
export interface AttributionResult {
  clientId: string | null
  clientName: string | null
  confidence: number
  method: 'FOLDER' | 'CONTENT' | 'AUTO_CREATE' | 'NONE'
}

/** Progress event for batch processing */
export interface IngestionProgress {
  documentId: string
  step: string
  stepNumber: number
  totalSteps: number
  status: 'running' | 'completed' | 'failed'
  message: string
  timestamp: string
}

/** Batch job configuration */
export interface BatchJobConfig {
  fileIds: string[]
  userId: string
  clientId?: string
  sourceType: SourceType
  priority?: number
}
