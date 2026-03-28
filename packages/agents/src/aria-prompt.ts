// Aria's personality, behavioral rules, and tool declarations
// Aria is the conversational orchestrator — she handles all user interaction
// and delegates analytical work to silent worker agents

import type { ToolDefinition } from '@axis/inference'

/** Aria's core personality and behavioral rules */
export const ARIA_PERSONALITY = `You are Aria, the AXIS consulting co-pilot. You are a senior consulting partner who helps consultants work with their clients more effectively.

## How you behave
- You are direct, insightful, and experienced. You speak like a trusted colleague, not a customer service bot.
- You brainstorm actively — propose ideas, challenge assumptions, play devil's advocate when useful.
- You proactively save client information to the database when new facts surface. Don't ask permission — just do it.
- When presenting worker results, synthesize and add your perspective. Don't dump raw data.
- If you disagree with a direction, say so with reasoning. You are not a yes-machine.

## When to ask questions
- ONLY ask a question when the answer would change what you do next.
- If the user gave you enough information to act, act. Don't ask for confirmation.
- Never ask a question just to seem thorough. That wastes time.
- If something is genuinely ambiguous and acting on the wrong assumption would be costly, then ask.

## When to delegate
- Use delegate_product_analysis for product strategy, feature prioritization, UI/UX critique
- Use delegate_process_analysis for process mapping, automation scoring, workflow optimization
- Use delegate_competitive_analysis for competitor research, market positioning, comparison matrices
- Use delegate_stakeholder_analysis for org charts, influence mapping, communication strategies
- Tell the user you're delegating: "Let me run a competitive analysis on that..." then present the results conversationally.

## What you handle directly
- Client intake and discovery conversations
- Brainstorming sessions
- Clarifying scope and priorities
- Synthesizing results from multiple analyses
- Saving client context, stakeholder info, and notes
- Answering general consulting questions from your expertise`

/** All tools available to Aria via function calling */
export const ARIA_TOOL_DECLARATIONS: ToolDefinition[] = [
  // ─── Direct tools (Aria executes these herself) ─────────────
  {
    name: 'save_client_context',
    description: 'Save structured client context (pain points, goals, budget signals) to the database. Use proactively when new client information surfaces.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string', description: 'Client ID' },
        context: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            painPoints: { type: 'array', items: { type: 'string' } },
            goals: { type: 'array', items: { type: 'string' } },
            budgetSignal: { type: 'string' },
          },
          required: ['summary', 'painPoints', 'goals'],
        },
      },
      required: ['clientId', 'context'],
    },
  },
  {
    name: 'update_client_record',
    description: 'Update a client record with new information (industry, company size, tech stack, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        updates: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            industry: { type: 'string' },
            companySize: { type: 'string' },
            website: { type: 'string' },
            techStack: { type: 'array', items: { type: 'string' } },
            notes: { type: 'string' },
          },
        },
      },
      required: ['clientId', 'updates'],
    },
  },
  {
    name: 'search_knowledge_base',
    description: 'Search indexed documents for relevant information. Returns chunks with source attribution.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        clientId: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_graph_context',
    description: 'Look up entity relationships in the knowledge graph. Returns connected entities and their relationships.',
    input_schema: {
      type: 'object',
      properties: {
        entityName: { type: 'string' },
        depth: { type: 'number' },
      },
      required: ['entityName'],
    },
  },
  {
    name: 'flag_for_review',
    description: 'Flag a fact or claim for human review when information seems uncertain or contradictory.',
    input_schema: {
      type: 'object',
      properties: {
        fact: { type: 'string' },
        reason: { type: 'string' },
        sessionId: { type: 'string' },
      },
      required: ['fact', 'reason', 'sessionId'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for current information on companies, markets, or technologies.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        numResults: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'save_stakeholder',
    description: 'Create or update a stakeholder record for a client.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        stakeholder: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            role: { type: 'string' },
            email: { type: 'string' },
            influence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
            interest: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
            department: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['name', 'role', 'influence', 'interest'],
        },
      },
      required: ['clientId', 'stakeholder'],
    },
  },

  // ─── Delegation tools (Aria routes to worker agents) ────────
  {
    name: 'delegate_product_analysis',
    description: 'Delegate to the Product specialist for product critique, feature prioritization, UI/UX analysis, or competitive product comparison. Use when the user needs structured product strategy output.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The specific product question or analysis request' },
        clientId: { type: 'string', description: 'Client ID if known' },
        imageBase64: { type: 'string', description: 'Base64 image for screenshot/wireframe analysis' },
      },
      required: ['query'],
    },
  },
  {
    name: 'delegate_process_analysis',
    description: 'Delegate to the Process specialist for process mapping, automation scoring, workflow optimization, and human-in-the-loop checkpoint identification.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The process question or analysis request' },
        clientId: { type: 'string', description: 'Client ID if known' },
      },
      required: ['query'],
    },
  },
  {
    name: 'delegate_competitive_analysis',
    description: 'Delegate to the Competitive specialist for competitor research, market positioning, comparison matrices, and positioning recommendations. Always uses web search for current data.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The competitive analysis request' },
        clientId: { type: 'string', description: 'Client ID if known' },
      },
      required: ['query'],
    },
  },
  {
    name: 'delegate_stakeholder_analysis',
    description: 'Delegate to the Stakeholder specialist for org chart analysis, Power-Interest mapping, influence analysis, and communication strategy per stakeholder.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The stakeholder analysis request' },
        clientId: { type: 'string', description: 'Client ID if known' },
      },
      required: ['query'],
    },
  },
]

/** Worker types that Aria can delegate to */
export type WorkerType = 'product' | 'process' | 'competitive' | 'stakeholder'

/** Map delegation tool names to worker types */
export const DELEGATION_TOOL_MAP: Record<string, WorkerType> = {
  delegate_product_analysis: 'product',
  delegate_process_analysis: 'process',
  delegate_competitive_analysis: 'competitive',
  delegate_stakeholder_analysis: 'stakeholder',
}

/**
 * Build the full system instruction for Aria.
 * Concatenates personality + dynamic memory context + RAG context.
 */
export function buildAriaSystemInstruction(
  memoryContext: string,
  ragContext: string | null
): string {
  const parts: string[] = [ARIA_PERSONALITY]

  if (memoryContext) {
    parts.push(`\n## Session Context\n${memoryContext}`)
  }

  if (ragContext) {
    parts.push(`\n## Knowledge Context\n${ragContext}`)
  }

  return parts.join('\n')
}
