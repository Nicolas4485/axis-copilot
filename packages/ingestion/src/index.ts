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
export { parsePptxTemplate } from './parsers/pptx-template-parser.js'
export type { PptxTheme, ParsedPptxTemplate } from './parsers/pptx-template-parser.js'
export { getParser, canParse, SUPPORTED_MIME_TYPES } from './parsers/index.js'
export type { DocumentParser } from './parsers/index.js'
export { GDocParser } from './parsers/gdoc-parser.js'
export { GSheetParser } from './parsers/gsheet-parser.js'
export { GSlidesParser } from './parsers/gslides-parser.js'
export { PdfParser } from './parsers/pdf-parser.js'
export { TranscriptParser } from './parsers/transcript-parser.js'
export { DocxParser } from './parsers/docx-parser.js'
export { PptxParser } from './parsers/pptx-parser.js'
export { CodeParser, codeFileMimeType } from './parsers/code-parser.js'

// Pipeline
export { IngestionPipeline } from './pipeline.js'
export { DriveDiscovery } from './drive-discovery.js'
export { BatchProcessor } from './batch-processor.js'
export type { BatchJobStatus } from './batch-processor.js'
export { BulkProcessor } from './bulk-processor.js'
export type { BulkFile, BulkProgressEvent } from './bulk-processor.js'

// Webhook
export { WebhookHandler } from './webhook-handler.js'
export type { DriveWebhookPayload, WebhookChannel } from './webhook-handler.js'

// Financial extraction
export { extractFinancials, formatFinancialsForPrompt } from './parsers/financial-extractor.js'
export type { FinancialExtraction, FinancialYear } from './parsers/financial-extractor.js'
