// Parser registry — maps MIME types to parser implementations

import type { DocumentParser } from './types.js'
import { GDocParser } from './gdoc-parser.js'
import { GSheetParser } from './gsheet-parser.js'
import { GSlidesParser } from './gslides-parser.js'
import { PdfParser } from './pdf-parser.js'
import { TranscriptParser } from './transcript-parser.js'
import { DocxParser } from './docx-parser.js'
import { CodeParser } from './code-parser.js'

export type { DocumentParser } from './types.js'
export { GDocParser } from './gdoc-parser.js'
export { GSheetParser } from './gsheet-parser.js'
export { GSlidesParser } from './gslides-parser.js'
export { PdfParser } from './pdf-parser.js'
export { TranscriptParser } from './transcript-parser.js'
export { DocxParser } from './docx-parser.js'
export { CodeParser, codeFileMimeType } from './code-parser.js'

/** All registered parsers — order matters: more specific parsers first */
const PARSERS: DocumentParser[] = [
  new GDocParser(),
  new GSheetParser(),
  new GSlidesParser(),
  new PdfParser(),
  new CodeParser(),        // Before TranscriptParser so code MIME types don't fall through to transcripts
  new TranscriptParser(),
  new DocxParser(),
]

/** Supported MIME types for upload validation */
export const SUPPORTED_MIME_TYPES = PARSERS.flatMap((p) => p.supportedMimeTypes)

/**
 * Get the appropriate parser for a MIME type.
 * Returns null if no parser supports the type.
 */
export function getParser(mimeType: string): DocumentParser | null {
  return PARSERS.find((p) => p.supportedMimeTypes.includes(mimeType)) ?? null
}

/**
 * Check if a file can be parsed based on its MIME type or extension.
 */
export function canParse(mimeType: string): boolean {
  return PARSERS.some((p) => p.supportedMimeTypes.includes(mimeType))
}
