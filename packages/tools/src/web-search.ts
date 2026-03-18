// web_search — Web search via Anthropic, with 1-hour Redis cache
// Used by: ProductAgent, ProcessAgent, CompetitiveAgent, StakeholderAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

const CACHE_TTL_SECONDS = 3600 // 1 hour

export interface WebSearchInput {
  query: string
  numResults?: number
}

export const webSearchDefinition: ToolDefinition = {
  name: 'web_search',
  description: 'Search the web for current information on companies, products, market trends, or technologies. Returns titles, snippets, and URLs.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      numResults: { type: 'number', description: 'Number of results to return (default 5, max 10)' },
    },
    required: ['query'],
  },
}

export async function webSearch(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const query = input['query'] as string | undefined
  const numResults = Math.min((input['numResults'] as number | undefined) ?? 5, 10)

  if (!query || query.trim().length === 0) {
    return { success: false, data: null, error: 'Query is required', durationMs: Date.now() - start }
  }

  try {
    // Check Redis cache first
    // TODO: Wire Redis client
    // const cacheKey = `axis:websearch:${createHash('sha256').update(query).digest('hex')}`
    // const cached = await redis.get(cacheKey)
    // if (cached) return { success: true, data: JSON.parse(cached), durationMs: Date.now() - start }

    // Use Anthropic's web search tool via the SDK
    // The InferenceEngine wraps this — but web_search is a direct API call
    const apiKey = process.env['ANTHROPIC_API_KEY']
    if (!apiKey) {
      return { success: false, data: null, error: 'ANTHROPIC_API_KEY not configured', durationMs: Date.now() - start }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: numResults,
        }],
        messages: [{
          role: 'user',
          content: `Search the web for: ${query}. Return the top ${numResults} results with titles, URLs, and brief summaries.`,
        }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, data: null, error: `Web search API error: ${response.status} ${errorText}`, durationMs: Date.now() - start }
    }

    const data = await response.json() as Record<string, unknown>
    const content = data['content'] as Array<Record<string, unknown>> | undefined

    // Extract text results
    const results = content
      ?.filter((b) => b['type'] === 'text')
      .map((b) => b['text'] as string)
      .join('\n') ?? 'No results found'

    // Cache in Redis for 1 hour
    // TODO: await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(results))

    void CACHE_TTL_SECONDS

    return { success: true, data: { query, results, resultCount: numResults }, durationMs: Date.now() - start }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Web search failed: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
