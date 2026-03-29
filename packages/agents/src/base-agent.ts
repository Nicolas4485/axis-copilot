// BaseAgent — agentic loop with tool execution
// ALL model calls go through InferenceEngine — never call Anthropic SDK directly

import { InferenceEngine } from '@axis/inference'
import type { InferenceContentBlock, InferenceMessage } from '@axis/inference'
import { InfiniteMemory } from '@axis/memory'
import { ToolRegistry } from './tool-registry.js'
import type {
  AgentConfig,
  AgentContext,
  AgentResponse,
  Citation,
  ConflictFound,
  MemoryUpdate,
  ToolResult,
} from './types.js'

const MAX_ITERATIONS = 10

export class BaseAgent {
  protected config: AgentConfig
  protected engine: InferenceEngine
  protected toolRegistry: ToolRegistry
  protected memory: InfiniteMemory

  constructor(config: AgentConfig, engine: InferenceEngine, memory?: InfiniteMemory) {
    this.config = config
    this.engine = engine
    this.toolRegistry = new ToolRegistry()
    this.memory = memory ?? new InfiniteMemory({ engine })
  }

  /**
   * Run the agent on a user message with full agentic loop.
   *
   * 1. Build messages with system prompt key, assembled context, RAG context
   * 2. Call InferenceEngine.route("agent_response")
   * 3. If tool_use blocks: execute tools, feed results back
   * 4. Repeat until no tool_use blocks or max iterations
   * 5. Post-process: store message, update memory, attach citations
   */
  async run(userMessage: string, context: AgentContext): Promise<AgentResponse> {
    const toolsUsed: string[] = []
    const memoryUpdates: MemoryUpdate[] = []
    const citations: Citation[] = this.extractCitations(context)
    const conflictsFound: ConflictFound[] = this.extractConflicts(context)

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
