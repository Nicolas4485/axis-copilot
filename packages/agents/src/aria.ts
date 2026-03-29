// Aria — conversational orchestrator for AXIS
// Replaces the headless Orchestrator + absorbs IntakeAgent
// Uses Gemini 2.0 Flash for conversation, delegates to worker agents via InferenceEngine

import { InferenceEngine, GeminiClient } from '@axis/inference'
import { RAGEngine } from '@axis/rag'
import { InfiniteMemory } from '@axis/memory'
import type { ToolContext, ToolResult } from '@axis/tools'
import { ToolRegistry } from './tool-registry.js'
import { BaseAgent } from './base-agent.js'
import { ProductAgent } from './specialists/product-agent.js'
import { ProcessAgent } from './specialists/process-agent.js'
import { CompetitiveAgent } from './specialists/competitive-agent.js'
import { StakeholderAgent } from './specialists/stakeholder-agent.js'
import type { AgentContext, AgentResponse } from './types.js'
import {
  ARIA_TOOL_DECLARATIONS,
  DELEGATION_TOOL_MAP,
  buildAriaSystemInstruction,
  type WorkerType,
} from './aria-prompt.js'
import type { InferenceMessage, ToolDefinition } from '@axis/inference'

/** What Aria returns for text-mode messages */
export interface AriaResponse extends AgentResponse {
  /** Whether Aria delegated to any worker agents */
  delegations: Array<{
    workerType: WorkerType
    query: string
    success: boolean
  }>
}

/** Live session config returned by buildLiveSessionConfig() */
export interface LiveSessionConfig {
  systemInstruction: string
  tools: ToolDefinition[]
  model: string
}

export class Aria {
  private engine: InferenceEngine
  private gemini: GeminiClient
  private rag: RAGEngine
  private memory: InfiniteMemory
  private toolRegistry: ToolRegistry
  private workers: Record<WorkerType, BaseAgent>

  constructor(options?: {
    engine?: InferenceEngine
    rag?: RAGEngine
    memory?: InfiniteMemory
  }) {
    this.engine = options?.engine ?? new InferenceEngine()
    this.rag = options?.rag ?? new RAGEngine({ engine: this.engine })
    this.memory = options?.memory ?? new InfiniteMemory({ engine: this.engine })
    this.gemini = new GeminiClient()
    this.toolRegistry = new ToolRegistry()

    // Worker agents — silent analytical specialists
    this.workers = {
      product: new ProductAgent(this.engine, this.memory),
      process: new ProcessAgent(this.engine, this.memory),
      competitive: new CompetitiveAgent(this.engine, this.memory),
      stakeholder: new StakeholderAgent(this.engine, this.memory),
    }
  }

  /**
   * Handle a text-mode message.
   * Uses Gemini REST with function calling, falls back to InferenceEngine.
   */
  async handleTextMessage(
    sessionId: string,
    userId: string,
    message: string,
    imageBase64?: string
  ): Promise<AriaResponse> {
    // Step 1: Store user message in working memory
    await this.memory.addToWorkingMemory(sessionId, 'USER', message)

    // Step 2: Build context from memory + RAG
    const assembled = await this.memory.buildAgentContext(sessionId, userId, null, message)
    const ragResult = await this.rag.query(message, userId, null)

    const systemInstruction = buildAriaSystemInstruction(
      assembled.text,
      ragResult.context || null
    )

    const context: AgentContext = {
      sessionId,
      clientId: null,
      userId,
      assembledContext: assembled.text,
      ragResult,
      stakeholders: [],
      clientRecord: null,
    }

    const toolsUsed: string[] = []
    const delegations: Array<{ workerType: WorkerType; query: string; success: boolean }> = []

    // Build messages for Gemini
    const messages: InferenceMessage[] = [
      { role: 'user', content: imageBase64 ? `[Image attached]\n\n${message}` : message },
    ]

    // Step 3: Agentic loop with Gemini
    const useGemini = this.gemini.isConfigured()
    let finalContent = ''
    let reasoning = ''
    const maxIterations = 8

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let response

      if (useGemini) {
        try {
          response = await this.gemini.generateContent(
            systemInstruction,
            messages,
            { tools: ARIA_TOOL_DECLARATIONS, maxTokens: 4096 }
          )
        } catch (err) {
          console.warn(`[Aria] Gemini failed, falling back to InferenceEngine: ${err instanceof Error ? err.message : 'Unknown'}`)
          response = await this.engine.route('agent_response', {
            systemPromptKey: 'AGENT_INTAKE',
            messages,
            tools: ARIA_TOOL_DECLARATIONS,
            sessionId,
            userId,
          })
        }
      } else {
        response = await this.engine.route('agent_response', {
          systemPromptKey: 'AGENT_INTAKE',
          messages,
          tools: ARIA_TOOL_DECLARATIONS,
          sessionId,
          userId,
        })
      }

      // Collect text and tool calls
      const textParts: string[] = []
      const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

      for (const block of response.content) {
        if (block.type === 'text') {
          textParts.push(block.text)
        } else if (block.type === 'tool_use') {
          toolCalls.push(block)
        }
      }

      messages.push({ role: 'assistant', content: response.content })

      // No tool calls — done
      if (toolCalls.length === 0 || response.stopReason !== 'tool_use') {
        finalContent = textParts.join('\n')
        break
      }

      // Execute tools
      const toolResults: InferenceMessage['content'] = []
      for (const tc of toolCalls) {
        toolsUsed.push(tc.name)

        // Check if this is a delegation
        const workerType = DELEGATION_TOOL_MAP[tc.name]
        if (workerType) {
          const delegationResult = await this.delegate(
            workerType,
            tc.input['query'] as string ?? message,
            context,
            tc.input['imageBase64'] as string | undefined
          )
          delegations.push({ workerType, query: tc.input['query'] as string ?? message, success: true })

          toolResults.push({
            type: 'text' as const,
            text: `[Tool result for ${tc.name}]: ${JSON.stringify({
              content: delegationResult.content,
              toolsUsed: delegationResult.toolsUsed,
            })}`,
          })
        } else {
          // Direct tool execution
          const toolContext: ToolContext = {
            sessionId,
            userId,
            clientId: context.clientId ?? '',
            requestId: `${sessionId}-${iteration}-${tc.id}`,
          }

          const result = await this.toolRegistry.executeTool(tc.name, tc.input, toolContext)
          toolResults.push({
            type: 'text' as const,
            text: `[Tool result for ${tc.name}]: ${JSON.stringify(
              result.success ? result.data : { error: result.error }
            )}`,
          })
        }
      }

      messages.push({ role: 'user', content: toolResults })

      if (textParts.length > 0) {
        reasoning += textParts.join('\n') + '\n'
      }
    }

    // Store response in working memory
    await this.memory.addToWorkingMemory(sessionId, 'ASSISTANT', finalContent)

    // Extract citations and conflicts from RAG
    const citations = ragResult.citations.map((c) => ({
      documentId: c.documentId,
      chunkId: c.chunkId,
      content: c.content,
      relevanceScore: c.relevanceScore,
      sourceTitle: c.sourceTitle,
    }))

    const conflictsFound = ragResult.conflicts.map((c) => ({
      entityName: c.entityName,
      property: c.property,
      valueA: c.valueA,
      valueB: c.valueB,
      sourceA: c.sourceA,
      sourceB: c.sourceB,
    }))

    return {
      content: finalContent,
      reasoning,
      toolsUsed,
      memoryUpdates: [],
      citations,
      conflictsFound,
      delegations,
    }
  }

  /**
   * Build configuration for a Gemini Live session (voice/video mode).
   * Called by the API endpoint that returns a session token to the frontend.
   */
  async buildLiveSessionConfig(
    sessionId: string,
    userId: string,
  ): Promise<LiveSessionConfig> {
    const assembled = await this.memory.buildAgentContext(sessionId, userId, null, '')
    const ragResult = await this.rag.query('session context', userId, null)

    const systemInstruction = buildAriaSystemInstruction(
      assembled.text,
      ragResult.context || null
    )

    return {
      systemInstruction,
      tools: ARIA_TOOL_DECLARATIONS,
      model: 'gemini-3.1-flash-live-preview',
    }
  }

  /**
   * Execute a tool by name. Called during both live and text mode.
   */
  async executeTool(
    name: string,
    input: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    return this.toolRegistry.executeTool(name, input, context)
  }

  /**
   * Delegate to a worker agent.
   * Builds the full agent context and runs the specialist.
   */
  async delegate(
    workerType: WorkerType,
    query: string,
    context: AgentContext,
    imageBase64?: string
  ): Promise<AgentResponse> {
    const worker = this.workers[workerType]
    const enrichedQuery = imageBase64 ? `[Image attached]\n\n${query}` : query

    console.log(`[Aria] Delegating to ${workerType} worker: ${query.slice(0, 100)}`)
    const result = await worker.run(enrichedQuery, context)
    console.log(`[Aria] ${workerType} worker completed: ${result.content.length} chars, ${result.toolsUsed.length} tools used`)

    return result
  }

  /** Get the InferenceEngine (for cost tracking) */
  getEngine(): InferenceEngine {
    return this.engine
  }

  /** Get the memory system */
  getMemory(): InfiniteMemory {
    return this.memory
  }

  /** Check if Gemini is configured */
  isGeminiAvailable(): boolean {
    return this.gemini.isConfigured()
  }
}
