// BaseAgent — plan → retrieve → reflect → synthesise loop
// ALL model calls go through InferenceEngine — never call Anthropic SDK directly

import { InferenceEngine } from '@axis/inference'
import type { InferenceContentBlock, InferenceMessage } from '@axis/inference'
import { InfiniteMemory } from '@axis/memory'
import { RAGEngine } from '@axis/rag'
import { ToolRegistry } from './tool-registry.js'
import type {
  AgentConfig,
  AgentContext,
  AgentResponse,
  AgentTrace,
  Citation,
  ConflictFound,
  MemoryUpdate,
  QueryPlanItem,
  RAGResult,
  ReflectionResult,
  RetrievedEvidence,
  ToolResult,
} from './types.js'

const MAX_ITERATIONS      = 6   // Cap tool-use iterations per synthesis step
const MAX_REFLECT_CYCLES  = 2
// Hard wall-clock limit for the synthesis tool loop.
// Specialists run multiple tool calls so this needs headroom beyond Aria's loop.
// Mel (competitive) can run 15+ web searches — 240s gives enough room.
const AGENT_LOOP_TIMEOUT_MS = 240_000

/**
 * Extract the first complete JSON object or array from a model response.
 * Handles: markdown code fences, leading prose, trailing prose.
 */
function extractJSON(text: string): string {
  // Strip markdown code fences first
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  // Find the first { or [ and extract through its matching close
  const start = stripped.search(/[{[]/)
  if (start === -1) return stripped
  const opener = stripped[start]
  const closer = opener === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === opener) depth++
    else if (ch === closer) {
      depth--
      if (depth === 0) return stripped.slice(start, i + 1)
    }
  }
  return stripped.slice(start)
}

// Trivial-query threshold: skip plan/reflect for short non-question inputs
const TRIVIAL_WORD_LIMIT = 8

export class BaseAgent {
  protected config: AgentConfig
  protected engine: InferenceEngine
  protected toolRegistry: ToolRegistry
  protected memory: InfiniteMemory
  protected rag: RAGEngine | null

  constructor(config: AgentConfig, engine: InferenceEngine, memory?: InfiniteMemory, rag?: RAGEngine) {
    this.config = config
    this.engine = engine
    this.toolRegistry = new ToolRegistry()
    this.memory = memory ?? new InfiniteMemory({ engine })
    this.rag = rag ?? null
  }

  /**
   * Run the agent: plan → retrieve → reflect (≤2 cycles) → synthesise with tool loop.
   *
   * 1. Check if query is trivial → short-circuit directly to synthesis
   * 2. Decompose query into sub-questions with source assignments (LLM plan)
   * 3. Retrieve per sub-question (vector_kb, graph, web)
   * 4. Reflect: score evidence, identify gaps
   * 5. If insufficient and cycles remain: refine plan → re-retrieve → re-reflect
   * 6. Synthesise via existing tool loop with enriched context
   */
  async run(userMessage: string, context: AgentContext): Promise<AgentResponse> {
    const traceStart     = Date.now()
    const toolsUsed: string[]         = []
    const memoryUpdates: MemoryUpdate[] = []
    const citations: Citation[]         = this.extractCitations(context)
    const conflictsFound: ConflictFound[] = this.extractConflicts(context)

    // ── 1. Trivial-query check ───────────────────────────────────────────────
    const trivialQuery = this.isTrivialQuery(userMessage)
    let queryPlan: QueryPlanItem[]      = []
    const reflections: ReflectionResult[] = []
    let retrievalCycles                  = 0
    let planContextString                = ''

    if (trivialQuery) {
      console.log(`[AgentTrace] trivial_query=true — skipping plan/reflect`)
    } else {
      // ── 2. Query planning ──────────────────────────────────────────────────
      queryPlan = await this.planQuery(userMessage, context)
      console.log(`[AgentTrace] query_plan: ${JSON.stringify(queryPlan)}`)

      // ── 3+4. Retrieve → reflect loop (max 2 cycles) ────────────────────────
      let allEvidence: RetrievedEvidence[] = []

      for (let cycle = 0; cycle < MAX_REFLECT_CYCLES; cycle++) {
        retrievalCycles++

        const cycleEvidence = await this.retrieveForPlan(queryPlan, context)
        allEvidence = [...allEvidence, ...cycleEvidence]

        const reflection = await this.reflectOnEvidence(userMessage, cycleEvidence)
        reflections.push(reflection)
        console.log(`[AgentTrace] reflection_cycle_${cycle + 1}: ${JSON.stringify(reflection)}`)

        if (reflection.sufficient) {
          console.log(`[AgentTrace] sufficient=true at cycle ${cycle + 1} — proceeding to synthesis`)
          break
        }

        if (cycle < MAX_REFLECT_CYCLES - 1) {
          console.log(`[AgentTrace] sufficient=false — refining plan for cycle ${cycle + 2}`)
          queryPlan = await this.refinePlan(userMessage, reflection, queryPlan)
        } else {
          console.log(`[AgentTrace] max_reflect_cycles reached — proceeding with available evidence`)
        }
      }

      // ── Build enriched context block from all collected evidence ───────────
      planContextString = this.buildPlanContextString(allEvidence, reflections)
    }

    // ── 5. Synthesis: existing tool loop with enriched context ────────────────
    const userContent = this.buildUserContent(userMessage, context, planContextString || undefined)

    const toolDefinitions = this.toolRegistry
      .getDefinitions(this.config.tools)
      .map((def) => ({
        name:         def.name,
        description:  def.description,
        input_schema: def.inputSchema,
      }))

    const messages: InferenceMessage[] = [
      { role: 'user', content: userContent },
    ]

    let finalTextContent = ''
    let reasoning        = ''
    const loopStartMs    = Date.now()

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      if (Date.now() - loopStartMs > AGENT_LOOP_TIMEOUT_MS) {
        console.warn(`[Agent] Loop timeout after ${AGENT_LOOP_TIMEOUT_MS / 1000}s at iteration ${iteration} — returning partial result`)
        finalTextContent = finalTextContent || 'Analysis timed out — the request is taking too long. Please try again.'
        break
      }

      const response = await this.engine.route('agent_response', {
        systemPromptKey: this.config.systemPromptKey,
        messages,
        tools: toolDefinitions,
        sessionId: context.sessionId,
        userId:    context.userId,
      })

      const textBlocks: string[] = []
      const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

      for (const block of response.content) {
        if (block.type === 'text') {
          textBlocks.push(block.text)
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block)
        }
      }

      messages.push({ role: 'assistant', content: response.content })

      if (toolUseBlocks.length === 0 || response.stopReason !== 'tool_use') {
        finalTextContent = textBlocks.join('\n')
        break
      }

      const toolResultContent: InferenceContentBlock[] = []

      for (const toolUse of toolUseBlocks) {
        toolsUsed.push(toolUse.name)

        const toolContext = {
          sessionId: context.sessionId,
          userId:    context.userId,
          clientId:  context.clientId ?? '',
          requestId: `${context.sessionId}-${iteration}-${toolUse.id}`,
        }

        const result: ToolResult = await this.toolRegistry.executeTool(
          toolUse.name,
          toolUse.input,
          toolContext
        )

        toolResultContent.push({
          type:        'tool_result' as const,
          tool_use_id: toolUse.id,
          content:     JSON.stringify(result.success ? result.data : { error: result.error }),
        })
      }

      messages.push({ role: 'user', content: toolResultContent })

      if (textBlocks.length > 0) {
        reasoning += textBlocks.join('\n') + '\n'
      }
    }

    // ── Post-processing ───────────────────────────────────────────────────────
    let content = finalTextContent
    if (conflictsFound.length > 0) {
      content = this.buildConflictWarning(conflictsFound) + '\n\n' + content
    }

    await this.memory.addToWorkingMemory(context.sessionId, 'ASSISTANT', content)

    const trace: AgentTrace = {
      trivialQuery,
      queryPlan,
      retrievalCycles,
      reflections,
      totalDurationMs: Date.now() - traceStart,
    }

    console.log(`[AgentTrace] complete: ${JSON.stringify({ trivialQuery, planItems: queryPlan.length, retrievalCycles, reflectionSufficient: reflections[reflections.length - 1]?.sufficient ?? null, totalDurationMs: trace.totalDurationMs })}`)

    return {
      content,
      reasoning,
      toolsUsed,
      memoryUpdates,
      citations,
      conflictsFound,
      trace,
    }
  }

  // ─── Plan ────────────────────────────────────────────────────────────────────

  // ─── Specialist hooks (override in subclasses) ───────────────────────────────

  /**
   * Inject a structured output schema into the synthesis step.
   * Override in specialist subclasses to enforce section-based output.
   * Returning null (default) means no schema injection.
   */
  protected specialistOutputSchema(): string | null {
    return null
  }

  /**
   * Append specialist-specific critique to the reflection prompt.
   * e.g. Mel asks "is the source recent?", Sean asks "is the problem worth solving?"
   * Returning null (default) means no additional critique.
   */
  protected specialistReflectionCritique(): string | null {
    return null
  }

  /**
   * Heuristic: skip planning for short, conversational inputs that aren't questions.
   * e.g. "hello", "thanks", "ok", "sounds good"
   */
  private isTrivialQuery(message: string): boolean {
    const words = message.trim().split(/\s+/).filter((w) => w.length > 0)
    const hasQuestion = message.includes('?')
    return words.length < TRIVIAL_WORD_LIMIT && !hasQuestion
  }

  /**
   * Decompose the user query into sub-questions with source assignments.
   * Falls back to a single vector_kb sub-question on error.
   */
  private async planQuery(
    userMessage: string,
    _context: AgentContext
  ): Promise<QueryPlanItem[]> {
    try {
      const response = await this.engine.route('rag_plan', {
        systemPromptKey: 'RAG_QUERY_PLAN',
        messages: [{
          role: 'user',
          content: `User query: ${userMessage}`,
        }],
        maxTokens: 400,
      })

      const text = extractJSON(
        response.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('')
          .trim()
      )

      const parsed = JSON.parse(text) as { subQuestions?: unknown[] }
      const items = parsed.subQuestions

      if (!Array.isArray(items) || items.length === 0) {
        return this.fallbackPlan(userMessage)
      }

      return items
        .slice(0, 3)
        .map((item) => {
          const i = item as Record<string, unknown>
          return {
            subQuestion: String(i['subQuestion'] ?? userMessage),
            source:      this.validateSource(i['source']),
            rationale:   String(i['rationale'] ?? ''),
          }
        })
    } catch (err) {
      console.warn(`[Agent] planQuery failed: ${err instanceof Error ? err.message : String(err)} — using fallback plan`)
      return this.fallbackPlan(userMessage)
    }
  }

  private validateSource(raw: unknown): QueryPlanItem['source'] {
    if (raw === 'graph' || raw === 'web') return raw
    return 'vector_kb'
  }

  private fallbackPlan(userMessage: string): QueryPlanItem[] {
    return [{ subQuestion: userMessage, source: 'vector_kb', rationale: 'fallback' }]
  }

  // ─── Retrieve ────────────────────────────────────────────────────────────────

  /**
   * Dispatch each plan item to its assigned retrieval source.
   * vector_kb → RAGEngine, graph → get_graph_context tool, web → web_search tool.
   */
  private async retrieveForPlan(
    plan: QueryPlanItem[],
    context: AgentContext
  ): Promise<RetrievedEvidence[]> {
    const results = await Promise.allSettled(
      plan.map((item) => this.retrieveOneItem(item, context))
    )

    return results
      .map((r, i) => {
        if (r.status === 'fulfilled') return r.value
        console.warn(`[Agent] retrieveForPlan item ${i} failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
        return {
          subQuestion: plan[i]!.subQuestion,
          source:      plan[i]!.source,
          content:     '',
          chunkCount:  0,
        }
      })
  }

  private async retrieveOneItem(
    item: QueryPlanItem,
    context: AgentContext
  ): Promise<RetrievedEvidence> {
    const toolCtx = {
      sessionId: context.sessionId,
      userId:    context.userId,
      clientId:  context.clientId ?? '',
      requestId: `plan-${Date.now()}`,
    }

    if (item.source === 'vector_kb') {
      if (!this.rag) {
        return { subQuestion: item.subQuestion, source: 'vector_kb', content: '', chunkCount: 0 }
      }
      const result: RAGResult = await this.rag.query(item.subQuestion, context.userId, context.clientId)
      return {
        subQuestion: item.subQuestion,
        source:      'vector_kb',
        content:     result.context,
        chunkCount:  result.metadata?.totalChunksAfterRerank ?? 0,
      }
    }

    if (item.source === 'graph') {
      const toolResult: ToolResult = await this.toolRegistry.executeTool(
        'get_graph_context',
        { query: item.subQuestion, clientId: context.clientId ?? '' },
        toolCtx
      )
      const content = toolResult.success
        ? JSON.stringify(toolResult.data).slice(0, 2000)
        : ''
      return { subQuestion: item.subQuestion, source: 'graph', content, chunkCount: content ? 1 : 0 }
    }

    if (item.source === 'web') {
      const toolResult: ToolResult = await this.toolRegistry.executeTool(
        'web_search',
        { query: item.subQuestion },
        toolCtx
      )
      const content = toolResult.success
        ? JSON.stringify(toolResult.data).slice(0, 2000)
        : ''
      return { subQuestion: item.subQuestion, source: 'web', content, chunkCount: content ? 1 : 0 }
    }

    return { subQuestion: item.subQuestion, source: item.source, content: '', chunkCount: 0 }
  }

  // ─── Reflect ─────────────────────────────────────────────────────────────────

  /**
   * Critique the collected evidence. Returns whether it sufficiently answers
   * the query, what's missing, and per-source relevance scores.
   */
  private async reflectOnEvidence(
    userMessage: string,
    evidence: RetrievedEvidence[]
  ): Promise<ReflectionResult> {
    const noContent = evidence.every((e) => !e.content)
    if (noContent) {
      return { sufficient: false, missingInfo: ['No evidence retrieved'], snippetScores: [] }
    }

    const evidenceSummary = evidence
      .filter((e) => e.content)
      .map((e) => `[${e.source}] ${e.subQuestion}:\n${e.content.slice(0, 600)}`)
      .join('\n\n---\n\n')

    try {
      const critique = this.specialistReflectionCritique()
      const critiqueNote = critique ? `\n\nAdditional evaluation criteria:\n${critique}` : ''

      const response = await this.engine.route('rag_reflect', {
        systemPromptKey: 'RAG_REFLECT',
        messages: [{
          role: 'user',
          content: `User question: ${userMessage}\n\nRetrieved evidence:\n${evidenceSummary}${critiqueNote}`,
        }],
        maxTokens: 600,
      })

      const text = extractJSON(
        response.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('')
          .trim()
      )

      const parsed = JSON.parse(text) as {
        sufficient?: boolean
        missingInfo?: unknown[]
        snippetScores?: Array<{ source: unknown; score: unknown }>
      }

      return {
        sufficient:    parsed.sufficient === true,
        missingInfo:   Array.isArray(parsed.missingInfo)
          ? parsed.missingInfo.map(String)
          : [],
        snippetScores: Array.isArray(parsed.snippetScores)
          ? parsed.snippetScores.map((s) => ({
              source: String(s.source ?? ''),
              score:  Number(s.score ?? 0),
            }))
          : [],
      }
    } catch (err) {
      console.warn(`[Agent] reflectOnEvidence failed: ${err instanceof Error ? err.message : String(err)} — defaulting to sufficient=true`)
      // Don't block synthesis on reflection failure
      return { sufficient: true, missingInfo: [], snippetScores: [] }
    }
  }

  // ─── Refine ──────────────────────────────────────────────────────────────────

  /**
   * Generate a refined plan targeting identified gaps.
   * Reuses query_expansion to rephrase missing-info items into sub-questions.
   */
  private async refinePlan(
    userMessage: string,
    reflection: ReflectionResult,
    prevPlan: QueryPlanItem[]
  ): Promise<QueryPlanItem[]> {
    if (reflection.missingInfo.length === 0) return prevPlan

    const gapText = reflection.missingInfo.join('; ')

    try {
      const response = await this.engine.route('rag_plan', {
        systemPromptKey: 'RAG_QUERY_PLAN',
        messages: [{
          role: 'user',
          content: `Original query: ${userMessage}\nInformation gaps identified: ${gapText}\nGenerate up to 2 sub-questions specifically targeting these gaps.`,
        }],
        maxTokens: 300,
      })

      const text = extractJSON(
        response.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('')
          .trim()
      )

      const parsed = JSON.parse(text) as { subQuestions?: unknown[] }
      const items  = parsed.subQuestions

      if (!Array.isArray(items) || items.length === 0) return prevPlan

      const refined = items.slice(0, 2).map((item) => {
        const i = item as Record<string, unknown>
        return {
          subQuestion: String(i['subQuestion'] ?? gapText),
          source:      this.validateSource(i['source']),
          rationale:   String(i['rationale'] ?? 'gap-fill'),
        }
      })

      console.log(`[AgentTrace] refined_plan: ${JSON.stringify(refined)}`)
      return refined
    } catch (err) {
      console.warn(`[Agent] refinePlan failed: ${err instanceof Error ? err.message : String(err)} — keeping original plan`)
      return prevPlan
    }
  }

  // ─── Context assembly ────────────────────────────────────────────────────────

  /**
   * Build a structured evidence block from all plan retrievals.
   * Injected into user content so the synthesis step sees richer context.
   */
  private buildPlanContextString(
    evidence: RetrievedEvidence[],
    reflections: ReflectionResult[]
  ): string {
    const evidenceParts = evidence
      .filter((e) => e.content)
      .map((e) => `[${e.source.toUpperCase()}] ${e.subQuestion}\n${e.content.slice(0, 1500)}`)
      .join('\n\n')

    if (!evidenceParts) return ''

    const lastReflection = reflections[reflections.length - 1]
    const gapNote = lastReflection && !lastReflection.sufficient && lastReflection.missingInfo.length > 0
      ? `\nNote: The following information was not found in retrieved sources: ${lastReflection.missingInfo.join(', ')}.`
      : ''

    return evidenceParts + gapNote
  }

  /** Build the user content block with all context layers */
  private buildUserContent(
    userMessage: string,
    context: AgentContext,
    planContext?: string
  ): string {
    const parts: string[] = []

    if (context.assembledContext) {
      parts.push(`<CONTEXT>\n${context.assembledContext}\n</CONTEXT>`)
    }

    // Original RAG context (pre-retrieved by caller)
    if (context.ragResult?.context) {
      parts.push(context.ragResult.context)
    }

    // Plan-driven retrieval evidence (new)
    if (planContext) {
      parts.push(`<PLANNED_RETRIEVAL>\n${planContext}\n</PLANNED_RETRIEVAL>`)
    }

    if (context.clientRecord) {
      parts.push(
        `<CLIENT>\nName: ${context.clientRecord.name}\nIndustry: ${context.clientRecord.industry}\nSize: ${context.clientRecord.companySize}\n</CLIENT>`
      )
    }

    if (context.stakeholders.length > 0) {
      const list = context.stakeholders
        .map((s) => `- ${s.name} (${s.role}) | Influence: ${s.influence} | Interest: ${s.interest}`)
        .join('\n')
      parts.push(`<STAKEHOLDERS>\n${list}\n</STAKEHOLDERS>`)
    }

    // Specialist output schema — enforce structured sections
    const schema = this.specialistOutputSchema()
    if (schema) {
      parts.push(`<OUTPUT_FORMAT>\n${schema}\n</OUTPUT_FORMAT>`)
    }

    parts.push(userMessage)
    return parts.join('\n\n')
  }

  // ─── Citation / conflict helpers ──────────────────────────────────────────────

  private extractCitations(context: AgentContext): Citation[] {
    if (!context.ragResult) return []
    return context.ragResult.citations.map((c) => ({
      documentId:     c.documentId,
      chunkId:        c.chunkId,
      content:        c.content,
      relevanceScore: c.relevanceScore,
      sourceTitle:    c.sourceTitle,
    }))
  }

  private extractConflicts(context: AgentContext): ConflictFound[] {
    if (!context.ragResult) return []
    return context.ragResult.conflicts.map((c) => ({
      entityName: c.entityName,
      property:   c.property,
      valueA:     c.valueA,
      valueB:     c.valueB,
      sourceA:    c.sourceA,
      sourceB:    c.sourceB,
    }))
  }

  private buildConflictWarning(conflicts: ConflictFound[]): string {
    const lines = conflicts.map(
      (c) => `- ${c.entityName}.${c.property}: "${c.valueA}" (${c.sourceA}) vs "${c.valueB}" (${c.sourceB})`
    )
    return `⚠️ CONFLICTING INFORMATION DETECTED:\n${lines.join('\n')}\nPlease verify before relying on this data.`
  }
}
