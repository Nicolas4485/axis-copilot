// Drive Discovery — automatic client attribution for Google Drive files
// Step 1: Folder attribution via Levenshtein match
// Step 2: Content attribution via Qwen3
// Step 3: Auto-create client if new company detected

import { InferenceEngine } from '@axis/inference'
import type { DriveFileInfo, AttributionResult } from './types.js'

/** Known client record for matching */
interface KnownClient {
  id: string
  name: string
  industry: string
  aliases: string[]  // alternate names, abbreviations
}

const LEVENSHTEIN_THRESHOLD = 0.7  // Minimum similarity score for folder match
const CONTENT_CONFIDENCE_THRESHOLD = 0.6

/**
 * DriveDiscovery attributes files to clients using a 3-step process:
 * 1. Folder name matching (fast, high confidence)
 * 2. Content analysis via Qwen3 (slower, medium confidence)
 * 3. Auto-create new client if a company is clearly identified
 */
export class DriveDiscovery {
  private engine: InferenceEngine

  constructor(engine?: InferenceEngine) {
    this.engine = engine ?? new InferenceEngine()
  }

  /**
   * Attribute a Drive file to a client.
   * Tries folder match first, then content analysis, then auto-create.
   */
  async attributeFile(
    file: DriveFileInfo,
    knownClients: KnownClient[],
    contentPreview?: string
  ): Promise<AttributionResult> {
    // Step 1: Folder attribution via Levenshtein match
    const folderResult = this.matchByFolder(file.parentFolders, knownClients)
    if (folderResult) return folderResult

    // Step 2: Content attribution via Qwen3
    if (contentPreview) {
      const contentResult = await this.matchByContent(contentPreview, knownClients)
      if (contentResult) return contentResult
    }

    // Step 3: Check if content mentions a new company → auto-create
    if (contentPreview) {
      const autoCreate = await this.detectNewCompany(contentPreview, file.name)
      if (autoCreate) return autoCreate
    }

    return {
      clientId: null,
      clientName: null,
      confidence: 0,
      method: 'NONE',
    }
  }

  /**
   * Step 1: Match parent folder names against known client names
   * using Levenshtein distance for fuzzy matching.
   */
  private matchByFolder(
    parentFolders: string[],
    knownClients: KnownClient[]
  ): AttributionResult | null {
    let bestMatch: { client: KnownClient; score: number } | null = null

    for (const folder of parentFolders) {
      const normalised = folder.toLowerCase().trim()

      for (const client of knownClients) {
        // Check exact name match
        const nameSimilarity = this.similarity(normalised, client.name.toLowerCase())
        if (nameSimilarity > (bestMatch?.score ?? LEVENSHTEIN_THRESHOLD)) {
          bestMatch = { client, score: nameSimilarity }
        }

        // Check aliases
        for (const alias of client.aliases) {
          const aliasSimilarity = this.similarity(normalised, alias.toLowerCase())
          if (aliasSimilarity > (bestMatch?.score ?? LEVENSHTEIN_THRESHOLD)) {
            bestMatch = { client, score: aliasSimilarity }
          }
        }
      }
    }

    if (bestMatch) {
      return {
        clientId: bestMatch.client.id,
        clientName: bestMatch.client.name,
        confidence: bestMatch.score,
        method: 'FOLDER',
      }
    }

    return null
  }

  /**
   * Step 2: Use Qwen3 to analyse content and match to a known client.
   */
  private async matchByContent(
    contentPreview: string,
    knownClients: KnownClient[]
  ): Promise<AttributionResult | null> {
    if (knownClients.length === 0) return null

    const clientList = knownClients
      .map((c) => `- ${c.name} (${c.industry})`)
      .join('\n')

    try {
      const response = await this.engine.route('classify', {
        systemPromptKey: 'MICRO_CLASSIFY',
        messages: [{
          role: 'user',
          content: `Which client does this document belong to? Reply with JSON: {"clientName": "...", "confidence": 0.0-1.0, "reasoning": "..."}

Known clients:
${clientList}

Document preview (first 500 chars):
${contentPreview.slice(0, 500)}`,
        }],
        maxTokens: 150,
      })

      const text = response.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('')

      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch?.[0]) return null

      const parsed = JSON.parse(jsonMatch[0]) as {
        clientName: string
        confidence: number
        reasoning: string
      }

      if (parsed.confidence < CONTENT_CONFIDENCE_THRESHOLD) return null

      const matched = knownClients.find(
        (c) => c.name.toLowerCase() === parsed.clientName.toLowerCase()
      )

      if (matched) {
        return {
          clientId: matched.id,
          clientName: matched.name,
          confidence: parsed.confidence,
          method: 'CONTENT',
        }
      }
    } catch {
      // Classification failed — fall through
    }

    return null
  }

  /**
   * Step 3: Detect if the content mentions a new company not in our system.
   * Returns an auto-create attribution if confident.
   */
  private async detectNewCompany(
    contentPreview: string,
    filename: string
  ): Promise<AttributionResult | null> {
    try {
      const response = await this.engine.route('classify', {
        systemPromptKey: 'MICRO_CLASSIFY',
        messages: [{
          role: 'user',
          content: `Does this document clearly belong to a specific company/client that is NOT in our system? If yes, reply with JSON: {"companyName": "...", "industry": "...", "confidence": 0.0-1.0}. If no clear company, reply: {"companyName": null}

Filename: ${filename}
Content preview:
${contentPreview.slice(0, 500)}`,
        }],
        maxTokens: 100,
      })

      const text = response.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('')

      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch?.[0]) return null

      const parsed = JSON.parse(jsonMatch[0]) as {
        companyName: string | null
        industry?: string
        confidence?: number
      }

      if (parsed.companyName && (parsed.confidence ?? 0) >= CONTENT_CONFIDENCE_THRESHOLD) {
        // TODO: Auto-create the client via Prisma
        // const newClient = await prisma.client.create({ ... })
        return {
          clientId: null,  // Will be set after auto-create
          clientName: parsed.companyName,
          confidence: parsed.confidence ?? 0.7,
          method: 'AUTO_CREATE',
        }
      }
    } catch {
      // Detection failed — fall through
    }

    return null
  }

  /**
   * Levenshtein similarity score (0.0 to 1.0).
   * 1.0 = identical strings, 0.0 = completely different.
   */
  private similarity(a: string, b: string): number {
    if (a === b) return 1.0
    if (a.length === 0 || b.length === 0) return 0.0

    const distance = this.levenshteinDistance(a, b)
    const maxLen = Math.max(a.length, b.length)
    return 1 - distance / maxLen
  }

  /**
   * Compute Levenshtein edit distance between two strings.
   */
  private levenshteinDistance(a: string, b: string): number {
    const m = a.length
    const n = b.length

    // Use two rows instead of full matrix for memory efficiency
    let prevRow = Array.from({ length: n + 1 }, (_, j) => j)

    for (let i = 1; i <= m; i++) {
      const currRow = [i] as number[]
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        currRow[j] = Math.min(
          (currRow[j - 1] ?? 0) + 1,          // insertion
          (prevRow[j] ?? 0) + 1,               // deletion
          (prevRow[j - 1] ?? 0) + cost         // substitution
        )
      }
      prevRow = currRow
    }

    return prevRow[n] ?? 0
  }
}
