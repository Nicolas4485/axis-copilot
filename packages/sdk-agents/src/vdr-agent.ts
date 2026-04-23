// VdrAgent — SDK-powered VDR document categoriser.
// Input: list of {filename, sizeKb} entries.
// Output: categorised list with docType + priority (1 LLM turn, no tool use).
// ZIP extraction and ingestion happen in the calling route to keep this pure.

import { query } from '@anthropic-ai/claude-agent-sdk'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { extractTextContent } from './utils.js'

const VdrDocTypeSchema = z.enum([
  'FINANCIAL_MODEL',
  'CIM',
  'LEGAL_AGREEMENT',
  'MANAGEMENT_PRESENTATION',
  'OPERATING_DATA',
  'CUSTOMER_LIST',
  'IP_DOCUMENTATION',
  'GENERAL',
])

const VdrCategorySchema = z.object({
  filename: z.string(),
  docType:  VdrDocTypeSchema,
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  summary:  z.string(),
})

const VdrOutputSchema = z.object({
  files: z.array(VdrCategorySchema),
})

export type VdrDocType   = z.infer<typeof VdrDocTypeSchema>
export type VdrCategory  = z.infer<typeof VdrCategorySchema>
export type VdrFileEntry = { filename: string; sizeKb: number }

export class VdrAgent {
  /**
   * Categorise a list of VDR filenames using one SDK query (pure reasoning).
   * Returns a VdrCategory per file; unrecognised filenames are omitted —
   * callers should fall back to GENERAL/MEDIUM for any missing entry.
   */
  async categorize(files: VdrFileEntry[]): Promise<VdrCategory[]> {
    if (files.length === 0) return []

    const fileList = files
      .map((f) => `- ${f.filename} (${f.sizeKb}KB)`)
      .join('\n')

    const prompt = `You are categorising files from a private equity VDR (Virtual Data Room).

FILES:
${fileList}

For EACH file determine:
- docType: FINANCIAL_MODEL (Excel models/projections) | CIM (Confidential Info Memo) | LEGAL_AGREEMENT (contracts/NDAs) | MANAGEMENT_PRESENTATION (pitch decks/slide decks) | OPERATING_DATA (KPIs/metrics/ops reports) | CUSTOMER_LIST (client/ARR data) | IP_DOCUMENTATION (patents/tech specs) | GENERAL (everything else)
- priority: HIGH (critical for investment decision) | MEDIUM (supporting analysis) | LOW (background/admin)
- summary: one sentence describing likely contents based on filename

Respond with ONLY valid JSON, no explanation or markdown:
{"files":[{"filename":"exact-filename","docType":"TYPE","priority":"LEVEL","summary":"..."}]}`

    const categories: VdrCategory[] = []

    for await (const msg of query({
      prompt,
      options: {
        model: 'claude-sonnet-4-6',
        tools: [],
        maxTurns: 1,
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        persistSession: false,
      },
    })) {
      const m = msg as SDKMessage
      if (m.type !== 'assistant') continue
      const text = extractTextContent(m.message.content)
      if (!text) continue
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) continue
        const parsed = VdrOutputSchema.safeParse(JSON.parse(jsonMatch[0]))
        if (parsed.success) categories.push(...parsed.data.files)
      } catch {
        // Categorisation failed — caller uses GENERAL/MEDIUM defaults
      }
    }

    return categories
  }
}
