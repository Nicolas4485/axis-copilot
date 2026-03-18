// Document ingestion pipeline — @axis/ingestion

// Types
export type {
  DocType,
  SourceType,
  SyncStatus,
  ParsedDocument,
  ParsedSection,
  DocumentMetadata,
  TypeSignal,
  DocumentChunk,
  ExtractedEntity,
  IngestionResult,
  ConflictDetected,
  DriveFileInfo,
  AttributionResult,
  IngestionProgress,
  BatchJobConfig,
} from './types.js'

// Parsers
export { getParser, canParse, SUPPORTED_MIME_TYPES } from './parsers/index.js'
export type { DocumentParser } from './parsers/index.js'
export { GDocParser } from './parsers/gdoc-parser.js'
export { GSheetParser } from './parsers/gsheet-parser.js'
export { GSlidesParser } from './parsers/gslides-parser.js'
export { PdfParser } from './parsers/pdf-parser.js'
export { TranscriptParser } from './parsers/transcript-parser.js'
export { DocxParser } from './parsers/docx-parser.js'

// Pipeline
export { IngestionPipeline } from './pipeline.js'
export { DriveDiscovery } from './drive-discovery.js'
export { BatchProcessor } from './batch-processor.js'
export type { BatchJobStatus } from './batch-processor.js'

// Webhook
export { WebhookHandler } from './webhook-handler.js'
export type { DriveWebhookPayload, WebhookChannel } from './webhook-handler.js'
