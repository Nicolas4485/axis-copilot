// Shared parser interface

import type { ParsedDocument } from '../types.js'

/** Every parser implements this interface */
export interface DocumentParser {
  /** MIME types this parser can handle */
  supportedMimeTypes: string[]
  /** Parse raw content into structured document */
  parse(content: Buffer, filename: string): Promise<ParsedDocument>
}
