// Code parser — parses source code files into structured sections
// Extracts functions, classes, imports, and comments as sections
// Handles: TypeScript, JavaScript, Python, Rust, Go, Java, SQL, GraphQL, CSS, Prisma, YAML, TOML, JSON

import type { DocumentParser } from './types.js'
import type { ParsedDocument, ParsedSection, TypeSignal } from '../types.js'

/** File extension → language mapping */
const EXTENSION_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.sql': 'sql',
  '.graphql': 'graphql', '.gql': 'graphql',
  '.css': 'css', '.scss': 'scss',
  '.prisma': 'prisma',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.toml': 'toml',
  '.json': 'json',
  '.md': 'markdown', '.mdx': 'markdown',
  '.env.example': 'env',
  '.txt': 'text',
}

/** MIME types that represent source code rather than transcripts/documents */
const CODE_MIME_TYPES = [
  'text/x-typescript',
  'text/x-javascript',
  'text/x-python',
  'text/x-rust',
  'text/x-go',
  'text/x-java',
  'text/x-sql',
  'text/x-graphql',
  'text/css',
  'text/x-scss',
  'text/x-prisma',
  'text/x-yaml',
  'text/x-toml',
  'text/x-markdown',
  'text/x-code',  // Generic code MIME we assign during GitHub sync
]

/** Regex patterns for detecting structural blocks across languages */
const BLOCK_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /^(?:export\s+)?(?:async\s+)?function\s+\w+/m,
    /^(?:export\s+)?(?:class|interface|type|enum)\s+\w+/m,
    /^(?:export\s+)?const\s+\w+\s*=/m,
  ],
  javascript: [
    /^(?:export\s+)?(?:async\s+)?function\s+\w+/m,
    /^(?:export\s+)?class\s+\w+/m,
    /^(?:export\s+)?const\s+\w+\s*=/m,
  ],
  python: [
    /^(?:async\s+)?def\s+\w+/m,
    /^class\s+\w+/m,
  ],
  rust: [
    /^(?:pub\s+)?(?:async\s+)?fn\s+\w+/m,
    /^(?:pub\s+)?(?:struct|enum|trait|impl)\s+\w+/m,
  ],
  go: [
    /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?\w+/m,
    /^type\s+\w+\s+(?:struct|interface)/m,
  ],
  java: [
    /^(?:public|private|protected)?\s*(?:static\s+)?(?:class|interface|enum)\s+\w+/m,
    /^(?:public|private|protected)?\s*(?:static\s+)?(?:[\w<>[\]]+)\s+\w+\s*\(/m,
  ],
}

/**
 * Detect language from filename extension.
 */
function detectLanguage(filename: string): string {
  const lower = filename.toLowerCase()
  for (const [ext, lang] of Object.entries(EXTENSION_LANG)) {
    if (lower.endsWith(ext)) return lang
  }
  return 'text'
}

/**
 * Map a filename to a code-specific MIME type.
 * Used during GitHub sync to route files to this parser instead of TranscriptParser.
 */
export function codeFileMimeType(filename: string): string | null {
  const lang = detectLanguage(filename)
  const mimeMap: Record<string, string> = {
    typescript: 'text/x-typescript',
    javascript: 'text/x-javascript',
    python: 'text/x-python',
    rust: 'text/x-rust',
    go: 'text/x-go',
    java: 'text/x-java',
    sql: 'text/x-sql',
    graphql: 'text/x-graphql',
    css: 'text/css',
    scss: 'text/x-scss',
    prisma: 'text/x-prisma',
    yaml: 'text/x-yaml',
    toml: 'text/x-toml',
    markdown: 'text/x-markdown',
    json: 'application/json',
  }
  return mimeMap[lang] ?? null
}

export class CodeParser implements DocumentParser {
  supportedMimeTypes = CODE_MIME_TYPES

  async parse(content: Buffer, filename: string): Promise<ParsedDocument> {
    const raw = content.toString('utf-8')
    const language = detectLanguage(filename)
    const lines = raw.split('\n')
    const sections = this.extractSections(lines, language, filename)
    const wordCount = raw.split(/\s+/).filter(Boolean).length

    const typeSignals: TypeSignal[] = [
      {
        docType: 'TECHNICAL_SPEC',
        confidence: 0.85,
        reason: `Source code file (${language}): ${filename}`,
      },
    ]

    // Markdown files might be docs, not code
    if (language === 'markdown') {
      typeSignals.length = 0
      typeSignals.push({
        docType: 'GENERAL',
        confidence: 0.6,
        reason: `Markdown file: ${filename}`,
      })
    }

    return {
      text: raw,
      sections,
      metadata: {
        title: filename,
        wordCount,
        mimeType: `text/x-${language}`,
        extra: {
          language,
          lineCount: lines.length,
          hasTests: /\.(test|spec)\.(ts|js|tsx|jsx|py)$/.test(filename),
        },
      },
      typeSignals,
    }
  }

  /**
   * Extract structural sections from source code.
   * Groups consecutive lines by top-level declarations (functions, classes, etc.)
   */
  private extractSections(
    lines: string[],
    language: string,
    filename: string
  ): ParsedSection[] {
    const sections: ParsedSection[] = []
    const patterns = BLOCK_PATTERNS[language]

    // For languages without block patterns, treat the whole file as one section
    if (!patterns || patterns.length === 0) {
      sections.push({
        title: filename,
        content: lines.join('\n'),
        level: 1,
        order: 0,
      })
      return sections
    }

    // Find line indices where top-level blocks start
    const blockStarts: Array<{ index: number; title: string }> = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      // Skip indented lines (not top-level)
      if (line.startsWith('  ') || line.startsWith('\t')) continue

      for (const pattern of patterns) {
        const match = line.match(pattern)
        if (match) {
          blockStarts.push({ index: i, title: line.trim().slice(0, 80) })
          break
        }
      }
    }

    // If no blocks found, return whole file as one section
    if (blockStarts.length === 0) {
      sections.push({
        title: filename,
        content: lines.join('\n'),
        level: 1,
        order: 0,
      })
      return sections
    }

    // Add imports/header as first section if blocks don't start at line 0
    if (blockStarts[0]!.index > 0) {
      const headerLines = lines.slice(0, blockStarts[0]!.index)
      const headerContent = headerLines.join('\n').trim()
      if (headerContent.length > 0) {
        sections.push({
          title: 'imports / header',
          content: headerContent,
          level: 1,
          order: 0,
        })
      }
    }

    // Create sections from block boundaries
    for (let i = 0; i < blockStarts.length; i++) {
      const start = blockStarts[i]!.index
      const end = i + 1 < blockStarts.length ? blockStarts[i + 1]!.index : lines.length
      const content = lines.slice(start, end).join('\n').trim()

      sections.push({
        title: blockStarts[i]!.title,
        content,
        level: 2,
        order: sections.length,
      })
    }

    return sections
  }
}
