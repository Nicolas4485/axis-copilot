// BaseAgent — agentic loop with tool execution and iterative retrieval
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
  Citation,
  ConflictFound,
  MemoryUpdate,
  RAGResult,
  ToolResult,
} from './types.js'

const MAX_ITERATIONS = 10
const MAX_RETRIEVAL_CYCLES = 2

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
   * Run the agent on a user message with full agentic loop.
   *
   * 1. Build messages with system prompt key, assembled context, RAG context
   * 2. Evaluate if initial RAG context is sufficient; if not, trigger re-retrieval (up to 2 cycles)
   * 3. Call InferenceEngine.route("agent_response")
   * 4. If tool_use blocks: execute tools, feed results back
   * 5. Repeat until no tool_use blocks or max iterations
   * 6. Post-process: store message, update memory, attach citations
   */
  async run(userMessage: string, context: AgentContext): Promise<AgentResponse> {
    const toolsUsed: string[] = []
    const memoryUpdates: MemoryUpdate[] = []
    const citations: Citation[] = this.extractCitations(context)
    const conflictsFound: ConflictFound[] = this.extractConflicts(context)

    // Evaluate and potentially re-retrieve context if insufficient
    let ragContext = context.ragResult
    let retrievalCycle = 1

    while (retrievalCycle <= MAX_RETRIEVAL_CYCLES && ragContext) {
      const isSufficient = await this.evaluateContextSufficiency(
        userMessage,
        ragContext,
        retrievalCycle
      )

      if (isSufficient) {
        console.log(`[Agent] RAG context deemed sufficient at cycle ${retrievalCycle}`)
        break
      }

      if (retrievalCycle < MAX_RETRIEVAL_CYCLES) {
        console.log(`[Agent] Context insufficient at cycle ${retrievalCycle} — re-retrieving...`)
        ragContext = await this.triggerReRetrieval(userMessage, ragContext, context)
        retrievalCycle++
      } else {
        console.log(`[Agent] Max retrieval cycles (${MAX_RETRIEVAL_CYCLES}) reached`)
        break
      }
    }

    // Update context with potentially re-retrieved results
    context = { ...context, ragResult: ragContext }

    // Build the user turn with assembled context and RAG context
    const userContent = this.buildUserContent(userMessage, context)

    // Get tool definitions for this agent's tools
    const toolDefinitions = this.toolRegistry
      .getDefinitions(this.config.tools)
      .map((def) => ({
        name: def.name,
        description: def.description,
        input_schema: def.inputSchema,
      }))

    // Conversation messages for the agentic loop
    const messages: InferenceMessage[] = [
      { role: 'user', content: userContent },
    ]

    let finalTextContent = ''
    let reasoning = ''

    // Agentic loop
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const response = await this.engine.route('agent_response', {
        systemPromptKey: this.config.systemPromptKey,
        messages,
        tools: toolDefinitions,
        sessionId: context.sessionId,
        userId: context.userId,
      })

      // Collect text blocks and tool_use blocks from response
      const textBlocks: string[] = []
      const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

      for (const block of response.content) {
        if (block.type === 'text') {
          textBlocks.push(block.text)
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block)
        }
      }

      // Append assistant message to conversation
      messages.push({ role: 'assistant', content: response.content })

      // If no tool calls, we're done
      if (toolUseBlocks.length === 0 || response.stopReason !== 'tool_use') {
        finalTextContent = textBlocks.join('\n')
        break
      }

      // Execute each tool and collect results
      const toolResultContent: InferenceContentBlock[] = []

      for (const toolUse of toolUseBlocks) {
        toolsUsed.push(toolUse.name)

        const toolContext = {
          sessionId: context.sessionId,
          userId: context.userId,
          clientId: context.clientId ?? '',
          requestId: `${context.sessionId}-${iteration}-${toolUse.id}`,
        }

        const result: ToolResult = await this.toolRegistry.executeTool(
          toolUse.name,
          toolUse.input,
          toolContext
        )

        // Feed tool result back as tool_result block (required by Claude)
        toolResultContent.push({
          type: 'tool_result' as const,
          tool_use_id: toolUse.id,
          content: JSON.stringify(
            result.success ? result.data : { error: result.error }
          ),
        })
      }

      messages.push({ role: 'user', content: toolResultContent })

      // Capture reasoning from intermediate text
      if (textBlocks.length > 0) {
        reasoning += textBlocks.join('\n') + '\n'
      }
    }

    // Post-processing

    // Prepend conflict warning if any
    let content = finalTextContent
    if (conflictsFound.length > 0) {
      const conflictWarning = this.buildConflictWarning(conflictsFound)
      content = conflictWarning + '\n\n' + content
    }

    // Store message in working memory
    await this.memory.addToWorkingMemory(context.sessionId, 'ASSISTANT', content)

    return {
      content,
      reasoning,
      toolsUsed,
      memoryUpdates,
      citations,
      conflictsFound,
    }
  }

  /** Evaluate if RAG context is sufficient to answer the query */
  private async evaluateContextSufficiency(
    userMessage: string,
    ragResult: { metadata: { vectorChunksFound: number; totalChunksAfterRerank: number }; context: string },
    retrievalCycle: number
  ): Promise<boolean> {
    // Heuristic checks:
    // 1. At least 3 chunks retrieved after reranking
    // 2. Context is substantial (>500 chars)
    // 3. Query appears answerable from context

    const hasMinimalChunks = ragResult.metadata.totalChunksAfterRerank >= 3
    const hasSubstantialContext = ragResult.context.length > 500

    if (!hasMinimalChunks || !hasSubstantialContext) {
      console.log(
        `[Agent] Cycle ${retrievalCycle}: Insufficient chunks (${ragResult.metadata.totalChunksAfterRerank}) or context length (${ragResult.context.length})`
      )
      return false
    }

    // Use LLM to evaluate if context answers the query
    try {
      const response = await this.engine.route('classify', {
        systemPromptKey: 'MICRO_CLASSIFY',
        messages: [{
          role: 'user',
          content: `Given the user query and the retrieved context, is there sufficient information to answer the query? Reply YES or NO.

Query: ${userMessage}

Context: ${ragResult.context.slice(0, 1000)}...`,
        }],
        maxTokens: 10,
      })

      const text = response.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()
        .toUpperCase()

      const sufficient = text.includes('YES')
      console.log(`[Agent] Cycle ${retrievalCycle}: Context sufficiency = ${sufficient}`)
      return sufficient
    } catch (err) {
      console.warn(`[Agent] Failed to evaluate context sufficiency: ${err instanceof Error ? err.message : 'Unknown'}`)
      // Default to true if evaluation fails
      return true
    }
  }

  /**
   * Re-retrieval: expand the user query into 2 alternative phrasings,
   * re-query RAG with the best alternative, and return whichever result has
   * more chunks. Falls back to the current result when RAG engine is unavailable.
   */
  private async triggerReRetrieval(
    userMessage: string,
    currentRagResult: RAGResult,
    context: AgentContext
  ): Promise<RAGResult> {
    if (!this.rag) {
      console.log('[Agent] No RAG engine available for re-retrieval — keeping current result')
      return currentRagResult
    }

    try {
      // Step 1: Generate an expanded/rephrased query using InferenceEngine
      const expansionResponse = await this.engine.route('query_expansion', {
        systemPromptKey: 'MICRO_CLASSIFY',
        messages: [{
          role: 'user',
          content: `The following query did not retrieve sufficient context from the knowledge base. Rewrite it in 1-2 alternative phrasings that might match different terminology in the documents. Output only the rephrased queries, one per line, no explanation.

Original query: ${userMessage}`,
        }],
        maxTokens: 150,
      })

      const expansionText = expansionResponse.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()

      const expandedQueries = expansionText
        .split('\n')
        .map((q) => q.replace(/^\d+[\.\)]\s*/, '').trim())
        .filter((q) => q.length > 10)
        .slice(0, 2)

      if (expandedQueries.length === 0) return currentRagResult

      // Step 2: Re-query with the first expanded query
      const expandedQuery = expandedQueries[0]!
      console.log(`[Agent] Re-retrieval query: "${expandedQuery}"`)

      const newResult = await this.rag.query(expandedQuery, context.userId, context.clientId)

      // Step 3: Return whichever result has more chunks
      const currentChunks = currentRagResult.metadata?.totalChunksAfterRerank ?? 0
      const newChunks = newResult.metadata?.totalChunksAfterRerank ?? 0

      if (newChunks > currentChunks) {
        console.log(`[Agent] Re-retrieval improved: ${currentChunks} → ${newChunks} chunks`)
        return newResult
      }

      console.log(`[Agent] Re-retrieval did not improve (${currentChunks} → ${newChunks}), keeping original`)
      return currentRagResult
    } catch (err) {
      console.warn(`[Agent] Re-retrieval failed: ${err instanceof Error ? err.message : 'Unknown'}`)
      return currentRagResult
    }
  }

  /** Build the user content with assembled context and RAG context */
  private buildUserContent(userMessage: string, context: AgentContext): string {
    const parts: string[] = []

    // Assembled context from InfiniteMemory (memory, client info, session history)
    if (context.assembledContext) {
      parts.push(`<CONTEXT>\n${context.assembledContext}\n</CONTEXT>`)
    }

    // RAG knowledge context — already formatted by ContextCompressor
    if (context.ragResult && context.ragResult.context) {
      parts.push(context.ragResult.context)
    }

    // Client record if available
    if (context.clientRecord) {
      parts.push(
        `<CLIENT>\nName: ${context.clientRecord.name}\nIndustry: ${context.clientRecord.industry}\nSize: ${context.clientRecord.companySize}\n</CLIENT>`
      )
    }

    // Stakeholders if available
    if (context.stakeholders.length > 0) {
      const stakeholderList = context.stakeholders
        .map((s) => `- ${s.name} (${s.role}) | Influence: ${s.influence} | Interest: ${s.interest}`)
        .join('\n')
      parts.push(`<STAKEHOLDERS>\n${stakeholderList}\n</STAKEHOLDERS>`)
    }

    // The actual user message
    parts.push(userMessage)

    return parts.join('\n\n')
  }

  /** Extract citations from RAG result */
  private extractCitations(context: AgentContext): Citation[] {
    if (!context.ragResult) return []
    return context.ragResult.citations.map((c) => ({
      documentId: c.documentId,
      chunkId: c.chunkId,
      content: c.content,
      relevanceScore: c.relevanceScore,
      sourceTitle: c.sourceTitle,
    }))
  }

  /** Extract conflicts from RAG result */
  private extractConflicts(context: AgentContext): ConflictFound[] {
    if (!context.ragResult) return []
    return context.ragResult.conflicts.map((c) => ({
      entityName: c.entityName,
      property: c.property,
      valueA: c.valueA,
      valueB: c.valueB,
      sourceA: c.sourceA,
      sourceB: c.sourceB,
    }))
  }

  /** Build a conflict warning message */
  private buildConflictWarning(conflicts: ConflictFound[]): string {
    const lines = conflicts.map(
      (c) =>
        `- ${c.entityName}.${c.property}: "${c.valueA}" (${c.sourceA}) vs "${c.valueB}" (${c.sourceB})`
    )
    return `⚠️ CONFLICTING INFORMATION DETECTED:\n${lines.join('\n')}\nPlease verify before relying on this data.`
  }
}
