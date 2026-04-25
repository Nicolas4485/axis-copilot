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
  buildAriaVoiceSystemInstruction,
  type WorkerType,
} from './aria-prompt.js'
import type { InferenceMessage, ToolDefinition } from '@axis/inference'

/** Progress event emitted in real-time during handleTextMessage() */
export type AriaProgressEvent =
  | { type: 'rag_search'; label: string; models: string[] }
  | { type: 'rag_done';   label: string; resultCount: number }
  | { type: 'model_call'; label: string; model: string; iteration: number }
  | { type: 'tool_start'; tool: string;  label: string }
  | { type: 'tool_result'; tool: string; label: string; durationMs: number; success: boolean }
  | { type: 'delegation'; tool: string;  workerName: string; query: string }

/** Human-readable label for a tool call given its name and input */
function toolLabel(name: string, input: Record<string, unknown>): string {
  const q      = String(input['query'] ?? '').slice(0, 70)
  const entity = String(input['entity'] ?? input['entityName'] ?? '').slice(0, 70)
  switch (name) {
    case 'search_knowledge_base':         return q ? `Searching knowledge base for "${q}"` : 'Searching knowledge base'
    case 'search_google_drive':           return q ? `Searching Drive for "${q}"` : 'Searching Google Drive'
    case 'read_drive_document':           return 'Reading document from Drive'
    case 'get_graph_context':             return entity ? `Knowledge graph: "${entity}"` : 'Querying knowledge graph'
    case 'web_search':                    return q ? `Web search: "${q}"` : 'Searching the web'
    case 'ingest_document':               return 'Ingesting document into knowledge base'
    case 'delegate_product_analysis':     return 'Delegating to Sean · Product Strategy'
    case 'delegate_process_analysis':     return 'Delegating to Kevin · Process Optimization'
    case 'delegate_competitive_analysis': return 'Delegating to Mel · Competitive Intelligence'
    case 'delegate_stakeholder_analysis': return 'Delegating to Anjie · Stakeholder Analysis'
    case 'save_analysis':                 return 'Saving analysis to knowledge base'
    case 'save_client_context':           return 'Updating client record'
    case 'draft_email':                   return 'Drafting email'
    case 'save_competitor':               return 'Saving competitor profile'
    case 'save_stakeholder':              return 'Saving stakeholder data'
    case 'generate_comparison_matrix':    return 'Generating comparison matrix'
    default:                              return name.replace(/_/g, ' ')
  }
}

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
  /** Background RAG preload — resolves after session setup, injected async */
  ragPreload: Promise<string | null>
}

export class Aria {
  private engine: InferenceEngine
  private gemini: GeminiClient
  private rag: RAGEngine
  private memory: InfiniteMemory
  private toolRegistry: ToolRegistry
  private workers: Record<WorkerType, BaseAgent>
  private prisma: import('@prisma/client').PrismaClient | null

  constructor(options?: {
    engine?: InferenceEngine
    rag?: RAGEngine
    memory?: InfiniteMemory
    prisma?: import('@prisma/client').PrismaClient
  }) {
    this.engine = options?.engine ?? new InferenceEngine()
    this.prisma = options?.prisma ?? null
    this.rag = options?.rag ?? new RAGEngine({ engine: this.engine, prisma: options?.prisma! })
    this.memory = options?.memory ?? new InfiniteMemory({ engine: this.engine, prisma: options?.prisma })
    this.gemini = new GeminiClient()
    this.toolRegistry = new ToolRegistry()

    // Worker agents — silent analytical specialists.
    // Pass the RAG engine so they can do re-retrieval when context is insufficient.
    this.workers = {
      product: new ProductAgent(this.engine, this.memory, this.rag),
      process: new ProcessAgent(this.engine, this.memory, this.rag),
      competitive: new CompetitiveAgent(this.engine, this.memory, this.rag),
      stakeholder: new StakeholderAgent(this.engine, this.memory, this.rag),
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
    imageBase64?: string,
    clientId?: string | null,
    priorMessages?: Array<{ role: 'user' | 'assistant'; content: string }>,
    onProgress?: (event: AriaProgressEvent) => void,
    clientName?: string | null,
    onAskUser?: (question: string, ctx: string, options: string[] | undefined, requestId: string) => Promise<string>,
    githubToken?: string
  ): Promise<AriaResponse> {
    // Step 1: Store user message in working memory
    await this.memory.addToWorkingMemory(sessionId, 'USER', message)

    const resolvedClientId = clientId ?? null

    // Step 2a: Session/memory context — always needed, cheap
    const assembled = await this.memory.buildAgentContext(sessionId, userId, resolvedClientId, message)

    // Step 2b: User name for personalisation
    let userName: string | null = null
    if (this.prisma) {
      try {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
        userName = user?.name ?? null
      } catch {
        // Non-critical
      }
    }

    // Step 2c: Intent classification — skip heavy pipeline for conversational questions
    // (e.g. "what did Sean do?", "can you clarify?", "summarise what we discussed")
    const intent = await this.classifyIntent(message, priorMessages ?? [])
    if (intent === 'conversational') {
      onProgress?.({ type: 'model_call', label: 'Answering from session context', model: 'Gemini 2.0 Flash', iteration: 0 })
      const sysInstruction = buildAriaSystemInstruction(assembled.text, null, userName, clientName)
      const convoMessages: InferenceMessage[] = [
        ...(priorMessages ?? []).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: message },
      ]
      try {
        const resp = await this.gemini.generateContent(sysInstruction, convoMessages)
        const textBlock = resp.content.find((b): b is { type: 'text'; text: string } => b.type === 'text')
        const conversationalContent = textBlock?.text ?? ''
        if (conversationalContent) {
          await this.memory.addToWorkingMemory(sessionId, 'ASSISTANT', conversationalContent)
          return { content: conversationalContent, reasoning: '', toolsUsed: [], memoryUpdates: [], citations: [], conflictsFound: [], delegations: [] }
        }
      } catch {
        // Gemini failed — fall through to full pipeline
      }
    }

    // Step 3: RAG query (retrieval / analytical, or fallback from failed conversational)
    onProgress?.({ type: 'rag_search', label: 'Searching knowledge base', models: ['Claude Haiku 4.5'] })
    const ragResult = await this.rag.query(message, userId, resolvedClientId)
    onProgress?.({ type: 'rag_done', label: `Found ${ragResult.citations.length} source${ragResult.citations.length !== 1 ? 's' : ''}`, resultCount: ragResult.citations.length })

    const systemInstruction = buildAriaSystemInstruction(
      assembled.text,
      ragResult.context || null,
      userName,
      clientName
    )

    const context: AgentContext = {
      sessionId,
      clientId: resolvedClientId,
      userId,
      assembledContext: assembled.text,
      ragResult,
      stakeholders: [],
      clientRecord: null,
      ...(githubToken ? { githubToken } : {}),
    }

    const toolsUsed: string[] = []
    const delegations: Array<{ workerType: WorkerType; query: string; success: boolean }> = []

    // Build messages — prepend full session history so Aria sees all prior context
    const messages: InferenceMessage[] = [
      ...(priorMessages ?? []).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: imageBase64 ? `[Image attached]\n\n${message}` : message },
    ]

    // Step 3: Agentic loop with Gemini
    const useGemini = this.gemini.isConfigured()
    let finalContent = ''
    let reasoning = ''
    const maxIterations = 8

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const modelName = useGemini ? 'Gemini 2.0 Flash' : 'Claude Sonnet 4.6'
      onProgress?.({
        type: 'model_call',
        label: iteration === 0 ? `Thinking with ${modelName}` : `Continuing with ${modelName}`,
        model: modelName,
        iteration,
      })

      let response

      // For analytical intent on the first iteration, inject a delegation-first hint
      // so Gemini calls the specialist tool immediately rather than gathering its own research.
      const geminiMessages: InferenceMessage[] =
        intent === 'analytical' && iteration === 0
          ? [
              ...messages,
              {
                role: 'user' as const,
                content:
                  'ROUTING NOTE: This request requires specialist analysis. Call ALL appropriate delegation tools NOW in your first response — you may call more than one if the request spans multiple domains (e.g. competitive + product = call both delegate_competitive_analysis AND delegate_product_analysis). Do NOT run web_search, search_knowledge_base, or any other research tools first. The specialists will conduct all research. ORDERING: If one specialist needs another specialist\'s output as context (e.g. product strategy is stronger when grounded in competitive findings), declare the dependency by setting waitForAgents: ["delegate_competitive_analysis"] on the dependent specialist\'s tool call. The system runs the dependency first and automatically injects its output — you do not manage the sequencing. Just delegate and declare dependencies where they make analytical sense.',
              },
            ]
          : messages

      if (useGemini) {
        try {
          response = await this.gemini.generateContent(
            systemInstruction,
            geminiMessages,
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
      // If any tool call in this batch is a delegation, skip all direct tools —
      // running web searches and Drive reads alongside a delegation is redundant.
      const batchHasDelegation = toolCalls.some(tc => !!DELEGATION_TOOL_MAP[tc.name])

      // Collect delegation requests first — fire them together via fireDelegationsWithChaining
      // so sequential chaining (product waits for competitive) works correctly.
      const pendingDelegationRequests: Array<{ workerType: WorkerType; query: string; imageBase64?: string; waitForAgents?: string[] }> = []
      const WORKER_NAMES_LOOP: Record<WorkerType, string> = { product: 'Sean', process: 'Kevin', competitive: 'Mel', stakeholder: 'Anjie' }

      for (const tc of toolCalls) {
        toolsUsed.push(tc.name)

        // Check if this is a delegation
        const workerType = DELEGATION_TOOL_MAP[tc.name]
        if (workerType) {
          const delegationQuery = tc.input['query'] as string ?? message
          const delegationImage = tc.input['imageBase64'] as string | undefined
          const waitForAgents = Array.isArray(tc.input['waitForAgents']) ? (tc.input['waitForAgents'] as string[]) : undefined
          if (waitForAgents?.length) {
            console.log(`[Aria] Gemini declared dependency: ${WORKER_NAMES_LOOP[workerType]} waitForAgents=[${waitForAgents.join(', ')}]`)
          }

          pendingDelegationRequests.push({ workerType, query: delegationQuery, ...(delegationImage ? { imageBase64: delegationImage } : {}), ...(waitForAgents?.length ? { waitForAgents } : {}) })
          delegations.push({ workerType, query: delegationQuery, success: true })

          const workerName = WORKER_NAMES_LOOP[workerType]
          toolResults.push({
            type: 'tool_result' as const,
            tool_use_id: tc.id,
            name: tc.name,
            content: JSON.stringify({
              status: 'delegated',
              agent: workerName,
              message: `${workerName} is working on this now. Their full analysis will appear in the chat shortly.`,
            }),
          })
        } else {
          // ask_clarification: pause and wait for user answer before continuing
          if (tc.name === 'ask_clarification') {
            const question  = tc.input['question'] as string ?? ''
            const ctx       = tc.input['context']  as string ?? ''
            const opts      = Array.isArray(tc.input['options']) ? tc.input['options'] as string[] : undefined
            const requestId = `clarify-${tc.id}`
            let answer: string
            if (onAskUser) {
              try { answer = await onAskUser(question, ctx, opts, requestId) }
              catch { answer = '[User did not respond — continue with best available information]' }
            } else {
              answer = '[No clarification channel — continue with best available information]'
            }
            toolResults.push({
              type: 'tool_result' as const,
              tool_use_id: tc.id,
              name: tc.name,
              content: JSON.stringify({ answer }),
            })
            continue
          }

          // Skip direct tools when the same batch contains a delegation call
          if (batchHasDelegation) {
            toolResults.push({
              type: 'tool_result' as const,
              tool_use_id: tc.id,
              name: tc.name,
              content: JSON.stringify({ skipped: true }),
            })
            continue
          }

          // Direct tool execution
          const toolContext: ToolContext = {
            sessionId,
            userId,
            clientId: context.clientId ?? '',
            requestId: `${sessionId}-${iteration}-${tc.id}`,
          }

          onProgress?.({ type: 'tool_start', tool: tc.name, label: toolLabel(tc.name, tc.input) })
          const _toolStart = Date.now()
          const result = await this.toolRegistry.executeTool(tc.name, tc.input, toolContext)
          onProgress?.({ type: 'tool_result', tool: tc.name, label: toolLabel(tc.name, tc.input), durationMs: Date.now() - _toolStart, success: result.success })
          toolResults.push({
            type: 'tool_result' as const,
            tool_use_id: tc.id,
            name: tc.name,
            content: JSON.stringify(
              result.success ? result.data : { error: result.error }
            ),
          })
        }
      }

      // Fire all collected delegations with sequential chaining
      if (pendingDelegationRequests.length > 0) {
        this.fireDelegationsWithChaining(pendingDelegationRequests, context, onProgress, sessionId, userId, onAskUser)
      }

      // Delegation fired — stop the loop immediately.
      // The acknowledgment fallback below handles empty finalContent.
      // This eliminates the extra Gemini round-trip just to say "Mel is working".
      if (delegations.length > 0) {
        if (textParts.length > 0) reasoning += textParts.join('\n') + '\n'
        break
      }

      messages.push({ role: 'user', content: toolResults })

      if (textParts.length > 0) {
        reasoning += textParts.join('\n') + '\n'
      }
    }

    // Programmatic delegation safeguard — Gemini sometimes forgets to call delegation tools.
    // If intent was analytical but no (or partial) delegation happened, fire the missing ones now.
    // Uses fireDelegationsWithChaining so chained workers (product after competitive) still run in order.
    if (intent === 'analytical') {
      const workerTypes = this.inferWorkerTypes(message)
      const alreadyDelegated = new Set(delegations.map(d => d.workerType))
      const missing = workerTypes.filter(wt => !alreadyDelegated.has(wt))

      if (missing.length > 0) {
        const safeguardRequests = missing.map(wt => ({ workerType: wt, query: message }))
        const WORKER_NAMES_SG: Record<WorkerType, string> = { product: 'Sean', process: 'Kevin', competitive: 'Mel', stakeholder: 'Anjie' }
        for (const wt of missing) {
          console.log(`[Aria] Safeguard delegation → ${WORKER_NAMES_SG[wt]} (Gemini missed this specialist)`)
          delegations.push({ workerType: wt, query: message, success: true })
        }
        this.fireDelegationsWithChaining(safeguardRequests, context, onProgress, sessionId, userId, onAskUser)
      }
    }

    // If Aria delegated but returned empty text (e.g. Gemini parse failure),
    // generate a guaranteed acknowledgment so the user isn't left with a blank response.
    if (!finalContent.trim() && delegations.length > 0) {
      const WORKER_NAMES: Record<string, string> = { product: 'Sean', process: 'Kevin', competitive: 'Mel', stakeholder: 'Anjie' }
      const names = delegations.map((d) => WORKER_NAMES[d.workerType] ?? d.workerType)
      finalContent = names.length === 1
        ? `${names[0]}'s on it — their full analysis will appear in the chat in about 60 seconds. Keep this tab open.`
        : `${names.join(' and ')} are working on this — their analyses will appear below shortly. Keep this tab open.`
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
   * Fire delegations with AI-declared sequential chaining.
   * - Gemini declares dependencies via waitForAgents on each tool call
   * - Emits delegation SSE events for ALL workers immediately (pending spinners show at once)
   * - Runs workers with no declared dependencies in parallel
   * - Runs dependent workers after their declared prerequisites, injecting predecessor output
   */
  private fireDelegationsWithChaining(
    requests: Array<{ workerType: WorkerType; query: string; imageBase64?: string; waitForAgents?: string[] }>,
    context: AgentContext,
    onProgress: ((event: AriaProgressEvent) => void) | undefined,
    sessionId: string,
    userId: string,
    onAskUser?: (question: string, ctx: string, options: string[] | undefined, requestId: string) => Promise<string>
  ): void {
    const WORKER_NAMES: Record<WorkerType, string> = { product: 'Sean', process: 'Kevin', competitive: 'Mel', stakeholder: 'Anjie' }

    // Build dependency map from AI-declared waitForAgents fields.
    // Maps each workerType → the workerTypes it must wait for.
    const requestedTypes = new Set(requests.map(r => r.workerType))
    const dependencyMap = new Map<WorkerType, WorkerType[]>()
    for (const req of requests) {
      if (req.waitForAgents?.length) {
        const deps: WorkerType[] = []
        for (const toolName of req.waitForAgents) {
          const depType = DELEGATION_TOOL_MAP[toolName]
          if (depType && requestedTypes.has(depType)) {
            deps.push(depType)
          }
        }
        if (deps.length > 0) dependencyMap.set(req.workerType, deps)
      }
    }

    const independent = requests.filter(r => !dependencyMap.has(r.workerType))
    const chained = requests.filter(r => dependencyMap.has(r.workerType))

    if (chained.length > 0) {
      const indNames = independent.map(r => WORKER_NAMES[r.workerType]).join(', ')
      const chainDesc = chained.map(r => {
        const deps = (dependencyMap.get(r.workerType) ?? []).map(d => WORKER_NAMES[d]).join('+')
        return `${WORKER_NAMES[r.workerType]} (after ${deps})`
      }).join(', ')
      console.log(`[Aria] Execution plan: parallel=[${indNames}] → chained=[${chainDesc}]`)
    }

    // Emit all delegation events upfront so pending spinners appear before SSE closes
    for (const req of requests) {
      onProgress?.({ type: 'delegation', tool: `delegate_${req.workerType}_analysis`, workerName: WORKER_NAMES[req.workerType], query: req.query })
    }

    const results = new Map<WorkerType, AgentResponse>()
    const _prismaRef = this.prisma
    const _memoryRef = this.memory
    const _self = this

    const saveResult = async (workerType: WorkerType, result: AgentResponse) => {
      const workerName = WORKER_NAMES[workerType]
      if (_memoryRef) {
        void _memoryRef.storeEpisodicMemory(userId, context.clientId, `${workerName} (${workerType}) analysis:\n${result.content.slice(0, 3000)}`, [workerType, workerName, sessionId, 'specialist_output'])
      }
      if (_prismaRef) {
        await _prismaRef.message.create({
          data: { sessionId, role: 'ASSISTANT', content: result.content, mode: 'intake', metadata: { agent: workerName.toLowerCase(), agentType: 'specialist', workerType, toolsUsed: result.toolsUsed, isPartial: result.isPartial ?? false } },
        })
        console.log(`[Specialist:${workerName}] ✓ output saved to session ${sessionId} (${result.content.length} chars)`)
      }
    }

    const saveError = async (workerType: WorkerType, err: unknown) => {
      const workerName = WORKER_NAMES[workerType]
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[Specialist:${workerName}] ERROR — ${errorMsg}`)
      if (_prismaRef) {
        await _prismaRef.message.create({
          data: { sessionId, role: 'ASSISTANT', content: `**${workerName}** ran into an issue: ${errorMsg}`, mode: 'intake', metadata: { agent: workerName.toLowerCase(), agentType: 'specialist', workerType, error: true } },
        }).catch(() => {})
      }
    }

    void (async () => {
      // Run independent workers in parallel
      await Promise.all(independent.map(async (req) => {
        try {
          const result = await _self.delegate(req.workerType, req.query, context, req.imageBase64, onAskUser)
          results.set(req.workerType, result)
          await saveResult(req.workerType, result)
        } catch (err) {
          await saveError(req.workerType, err)
        }
      }))

      // Run chained workers after their declared dependencies complete, injecting predecessor output
      for (const req of chained) {
        const deps = dependencyMap.get(req.workerType) ?? []
        const contextParts: string[] = []
        for (const dep of deps) {
          const depResult = results.get(dep)
          if (depResult) {
            const depName = WORKER_NAMES[dep]
            contextParts.push(`${depName.toUpperCase()} (${dep}) INTELLIGENCE — use as grounding context before producing your analysis:\n${depResult.content.slice(0, 5000)}`)
          }
        }
        const enrichedQuery = contextParts.length > 0
          ? `${req.query}\n\n---\n${contextParts.join('\n\n---\n')}\n---\nProduce your analysis grounded in the specialist context above.`
          : req.query
        const workerName = WORKER_NAMES[req.workerType]
        const depNames = deps.map(d => WORKER_NAMES[d]).join(', ')
        console.log(`[Specialist:${workerName}] START (chained after ${depNames}) — injecting ${contextParts.reduce((sum, p) => sum + p.length, 0)} chars of context`)
        try {
          const result = await _self.delegate(req.workerType, enrichedQuery, context, req.imageBase64, onAskUser)
          results.set(req.workerType, result)
          await saveResult(req.workerType, result)
        } catch (err) {
          await saveError(req.workerType, err)
        }
      }
    })()
  }

  /** Infer which specialist worker types are needed from message keywords (may return multiple) */
  private inferWorkerTypes(message: string): WorkerType[] {
    const lower = message.toLowerCase()
    const matches: WorkerType[] = []
    const competitiveKw = ['competitor', 'competitive', 'market leader', 'rival', 'comparison', ' vs ', 'versus', 'benchmark', 'landscape', 'market share', 'industry analysis', 'competitive analysis', 'compete', 'differentiat']
    const stakeholderKw = ['stakeholder', 'investor', 'board member', 'draft email', 'write email', 'outreach', 'communication', 'relationship', 'partner email', 'client email']
    const productKw = ['product strategy', 'product spec', 'feature', 'roadmap', 'go-to-market', 'gtm', 'product review', 'product analysis', 'pricing strategy', 'positioning']
    const processKw = ['process', 'workflow', 'efficiency', 'automation', 'operations', 'optimize', 'bottleneck', 'streamline', 'operational']
    if (competitiveKw.some(k => lower.includes(k))) matches.push('competitive')
    if (productKw.some(k => lower.includes(k))) matches.push('product')
    if (stakeholderKw.some(k => lower.includes(k))) matches.push('stakeholder')
    if (processKw.some(k => lower.includes(k))) matches.push('process')
    return matches
  }

  /** Classify intent to decide whether to skip the full pipeline */
  private async classifyIntent(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<'conversational' | 'retrieval' | 'analytical'> {
    if (!this.gemini.isConfigured()) return 'retrieval'
    const recentHistory = history
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'Nicolas' : 'Aria'}: ${String(m.content).slice(0, 200)}`)
      .join('\n')
    const prompt = recentHistory
      ? `Recent conversation:\n${recentHistory}\n\nNew message to classify: "${message.slice(0, 300)}"`
      : `Message to classify: "${message.slice(0, 300)}"`
    try {
      const response = await this.gemini.generateContent(
        `Classify the new message as exactly one of: conversational, retrieval, or analytical.\n\nconversational = about what was already discussed/done in this conversation, including: clarifications, follow-ups, corrections about a specialist result ("why did you do X?", "that's wrong", "what did Sean say?"), questions addressed to a named specialist about work they already produced\nretrieval = needs searching documents/emails/Drive/knowledge base for NEW information\nanalytical = needs specialist agents (Sean/Kevin/Mel/Anjie) to run a NEW analysis\n\nIMPORTANT: If the message is a reaction to, correction of, or question about a specialist result already produced in this conversation — classify as conversational, NOT analytical. Do NOT re-fire specialists for follow-up questions about existing work.\n\nReply with ONLY the single classification word.`,
        [{ role: 'user', content: prompt }],
      )
      const text =
        response.content
          .find((b): b is { type: 'text'; text: string } => b.type === 'text')
          ?.text?.trim()
          .toLowerCase() ?? ''
      if (text.startsWith('conversational')) return 'conversational'
      if (text.startsWith('analytical')) return 'analytical'
      return 'retrieval'
    } catch {
      return 'retrieval'
    }
  }

  /**
   * Build configuration for a Gemini Live (voice/video) session.
   * Uses the voice-specific system instruction which includes conciseness rules,
   * screen share awareness, and memory/RAG context.
   * Called server-side by the WebSocket proxy — never returns the API key.
   */
  async buildLiveSessionConfig(
    sessionId: string,
    userId: string,
    userName?: string | null,
    clientId?: string | null,
  ): Promise<LiveSessionConfig> {
    const resolvedClientId = clientId ?? null

    // Memory assembly is fast (50–200ms) — await it so the system instruction
    // includes session context from the start.
    const assembled = await this.memory.buildAgentContext(sessionId, userId, resolvedClientId, '')

    // RAG preload is slow (500–2000ms vector search) — start it in the background.
    // The caller injects the result via clientContent after Gemini setup completes,
    // so it never blocks the connection handshake.
    const ragPreload: Promise<string | null> = this.rag
      .query(`background context key facts ${userName ?? ''}`, userId, resolvedClientId)
      .then((r) => (r.context ? r.context.slice(0, 2500) : null))
      .catch(() => null)

    const systemInstruction = buildAriaVoiceSystemInstruction(
      assembled.text,
      null,
      userName
    )

    return {
      systemInstruction,
      tools: ARIA_TOOL_DECLARATIONS,
      model: 'gemini-3.1-flash-live-preview',
      ragPreload,
    }
  }

  /**
   * Assemble a fully populated AgentContext for specialist delegation.
   * Callable from the WebSocket proxy so that voice-mode delegations get
   * the same memory + RAG grounding as text-mode delegations.
   */
  async buildDelegationContext(
    sessionId: string,
    userId: string,
    clientId: string | null,
    query: string
  ): Promise<AgentContext> {
    const resolvedClientId = clientId ?? null
    const [assembled, ragResult] = await Promise.all([
      this.memory.buildAgentContext(sessionId, userId, resolvedClientId, query),
      this.rag.query(query, userId, resolvedClientId).catch(() => null),
    ])
    return {
      sessionId,
      clientId: resolvedClientId,
      userId,
      assembledContext: assembled.text,
      ragResult,
      stakeholders: [],
      clientRecord: null,
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
   * Emits structured debug logs for observability.
   */
  async delegate(
    workerType: WorkerType,
    query: string,
    context: AgentContext,
    imageBase64?: string,
    onAskUser?: (question: string, ctx: string, options: string[] | undefined, requestId: string) => Promise<string>
  ): Promise<AgentResponse> {
    const workerNames: Record<WorkerType, string> = {
      product: 'Sean', process: 'Kevin', competitive: 'Mel', stakeholder: 'Anjie',
    }
    const workerName = workerNames[workerType]
    const worker = this.workers[workerType]
    const enrichedQuery = imageBase64 ? `[Image attached]\n\n${query}` : query
    const delegationStart = Date.now()

    console.log(`[Specialist:${workerName}] START — query="${query.slice(0, 120)}" sessionId=${context.sessionId}`)

    const result = await worker.run(enrichedQuery, context, onAskUser)

    const durationMs = Date.now() - delegationStart

    // Structured specialist invocation log — visible in API server stdout
    console.log(`[Specialist:${workerName}] COMPLETE — ${JSON.stringify({
      workerType,
      durationMs,
      toolsUsed:       result.toolsUsed,
      toolCount:       result.toolsUsed.length,
      outputChars:     result.content.length,
      citationCount:   result.citations.length,
      conflictCount:   result.conflictsFound.length,
      trace:           result.trace ? {
        trivialQuery:    result.trace.trivialQuery,
        planItems:       result.trace.queryPlan.length,
        retrievalCycles: result.trace.retrievalCycles,
        totalMs:         result.trace.totalDurationMs,
      } : null,
      outputPreview:   result.content.slice(0, 300),
    })}`)

    return result
  }

  /**
   * Route a message directly to a single specialist, bypassing Aria orchestration.
   * Used by @-mention routing: `@Mel top 3 competitors?` → Mel only, no Aria text reply.
   */
  async runSpecialistDirectly(
    sessionId: string,
    userId: string,
    clientId: string | null,
    workerType: WorkerType,
    query: string,
    onAskUser?: (question: string, ctx: string, options: string[] | undefined, requestId: string) => Promise<string>,
    githubToken?: string
  ): Promise<AgentResponse> {
    const WORKER_NAMES: Record<WorkerType, string> = { product: 'Sean', process: 'Kevin', competitive: 'Mel', stakeholder: 'Anjie' }
    const workerName = WORKER_NAMES[workerType]

    // Build minimal context (lightweight RAG query for relevant docs)
    const ragResult = await this.rag.query(query, userId, clientId)
    const assembled = await this.memory.buildAgentContext(sessionId, userId, clientId, query)
    const context: AgentContext = {
      sessionId,
      clientId,
      userId,
      assembledContext: assembled.text,
      ragResult,
      stakeholders: [],
      clientRecord: null,
      ...(githubToken ? { githubToken } : {}),
    }

    console.log(`[Specialist:${workerName}] @-mention direct route — query="${query.slice(0, 120)}"`)
    const result = await this.delegate(workerType, query, context, undefined, onAskUser)

    // Persist memory + DB message (same as fireDelegationsWithChaining saveResult)
    void this.memory.storeEpisodicMemory(userId, clientId, `${workerName} (${workerType}) analysis:\n${result.content.slice(0, 3000)}`, [workerType, workerName, sessionId, 'specialist_output'])
    if (this.prisma) {
      await this.prisma.message.create({
        data: { sessionId, role: 'ASSISTANT', content: result.content, mode: 'intake', metadata: { agent: workerName.toLowerCase(), agentType: 'specialist', workerType, toolsUsed: result.toolsUsed, isPartial: result.isPartial ?? false } },
      })
      console.log(`[Specialist:${workerName}] ✓ @-mention result saved (${result.content.length} chars)`)
    }

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
