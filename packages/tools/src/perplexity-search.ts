// perplexity_search — Live web research via Perplexity Sonar API, with citation support
// Used by: CompetitiveAgent (Mel), DueDiligenceAgent (Alex), StakeholderAgent (Anjie), ProductAgent (Sean)
// Falls back gracefully when PERPLEXITY_API_KEY is not set.

import { createHash } from 'crypto'
import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

const CACHE_TTL_SECONDS = 3600 // 1 hour

export interface PerplexitySearchInput {
  query: string
  mode?: 'fast' | 'deep'              // 'fast' → sonar (~3s), 'deep' → sonar-pro (~8s)
  outputContext?: 'chat' | 'deliverable' // 'deliverable' returns citations[]
}

export interface PerplexityCitation {
  title: string
  url: string
  date?: string
}

export interface PerplexitySearchData {
  answer: string
  citations?: PerplexityCitation[]
  model: string
  durationMs: number
}

export const perplexitySearchDefinition: ToolDefinition = {
  name: 'perplexity_search',
  description:
    'Search the live web using Perplexity AI. Returns a synthesised answer with verifiable citations. ' +
    'Use mode:"deep" for formal deliverables (competitive briefs, DD reports). ' +
    'Use mode:"fast" for quick lookups. ' +
    'Set outputContext:"deliverable" to include citations in the result.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Research question or search query' },
      mode: {
        type: 'string',
        enum: ['fast', 'deep'],
        description: '"fast" uses sonar (~3s). "deep" uses sonar-pro (~8s). Inferred from query if omitted.',
      },
      outputContext: {
        type: 'string',
        enum: ['chat', 'deliverable'],
        description: '"deliverable" includes citations array for formal outputs. "chat" omits citations.',
      },
    },
    required: ['query'],
  },
}

function inferMode(query: string, explicit?: 'fast' | 'deep'): 'fast' | 'deep' {
  if (explicit) return explicit
  const q = query.toLowerCase()
  const deepKeywords = ['analysis', 'analyse', 'analyze', 'compare', 'comparison', 'landscape', 'benchmark', 'competitor', 'market research', 'due diligence']
  if (query.length > 200 || deepKeywords.some((kw) => q.includes(kw))) return 'deep'
  return 'fast'
}

export function formatCitations(citations: PerplexityCitation[]): string {
  if (citations.length === 0) return ''
  const lines = ['', 'Sources:']
  citations.forEach((c, i) => {
    const dateStr = c.date ? `, ${c.date}` : ''
    const domain = (() => { try { return new URL(c.url).hostname } catch { return c.url } })()
    lines.push(`[${i + 1}] ${c.title} (${domain}${dateStr})`)
  })
  return lines.join('\n')
}

export async function perplexitySearch(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const query = input['query'] as string | undefined
  const rawMode = input['mode'] as 'fast' | 'deep' | undefined
  const outputContext = (input['outputContext'] as 'chat' | 'deliverable' | undefined) ?? 'chat'

  if (!query || query.trim().length === 0) {
    return { success: false, data: null, error: 'Query is required', durationMs: Date.now() - start }
  }

  const apiKey = process.env['PERPLEXITY_API_KEY'] ?? process.env['Perplexity_API_KEY']
  if (!apiKey) {
    return {
      success: false,
      data: null,
      error: 'PERPLEXITY_API_KEY not set — falling back to web_search',
      durationMs: Date.now() - start,
    }
  }

  const mode = inferMode(query, rawMode)
  const model = mode === 'deep' ? 'sonar-pro' : 'sonar'

  // Cache key: sha256(query + mode) — same TTL pattern as web_search
  const cacheKey = `perplexity:${createHash('sha256').update(query + mode).digest('hex')}`
  void cacheKey  // TODO: wire Redis — `const cached = await redis.get(cacheKey)`
  void CACHE_TTL_SECONDS

  try {
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: 'user', content: query }],
      return_citations: true,
      return_images: false,
    }
    if (model === 'sonar-pro') {
      body['search_recency_filter'] = 'month'
    }

    // Hard timeout: sonar-pro can be slow — cap at 25s to avoid blocking the agent loop
    const timeoutMs = model === 'sonar-pro' ? 25_000 : 12_000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer))

    if (!response.ok) {
      const errText = await response.text()
      return {
        success: false,
        data: null,
        error: `Perplexity API error: ${response.status} ${errText}`,
        durationMs: Date.now() - start,
      }
    }

    const json = await response.json() as Record<string, unknown>
    const choices = json['choices'] as Array<Record<string, unknown>> | undefined
    const message = choices?.[0]?.['message'] as Record<string, unknown> | undefined
    const answer = (message?.['content'] as string | undefined) ?? ''

    // Parse citations from the Perplexity response (array of URL strings or objects)
    const rawCitations = json['citations'] as Array<unknown> | undefined
    const citations: PerplexityCitation[] = []
    if (rawCitations) {
      for (const c of rawCitations) {
        if (typeof c === 'string') {
          citations.push({ title: c, url: c })
        } else if (c && typeof c === 'object') {
          const obj = c as Record<string, unknown>
          const citation: PerplexityCitation = {
            title: (obj['title'] as string | undefined) ?? (obj['url'] as string) ?? '',
            url: (obj['url'] as string | undefined) ?? '',
          }
          if (typeof obj['date'] === 'string') citation.date = obj['date']
          citations.push(citation)
        }
      }
    }

    // TODO: await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify({ answer, citations, model }))

    const data: PerplexitySearchData = {
      answer,
      model,
      durationMs: Date.now() - start,
      ...(outputContext === 'deliverable' ? { citations } : {}),
    }

    return { success: true, data, durationMs: Date.now() - start }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    const errorMsg = isTimeout
      ? `Perplexity timed out after ${model === 'sonar-pro' ? 25 : 12}s — fall back to web_search`
      : `Perplexity search failed: ${err instanceof Error ? err.message : 'Unknown error'}`
    return { success: false, data: null, error: errorMsg, durationMs: Date.now() - start }
  }
}
