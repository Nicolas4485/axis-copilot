// Aria's personality, behavioral rules, and tool declarations
// Aria is the conversational orchestrator — she handles all user interaction
// and delegates analytical work to silent worker agents

import type { ToolDefinition } from '@axis/inference'

/** Aria's core personality and behavioral rules */
export const ARIA_PERSONALITY = `You are Aria, the lead consultant and orchestrator for AXIS. You run a team of specialist agents and work directly with the user as their AI consulting partner.

## How you behave
- You are direct, insightful, and experienced. You speak like a trusted colleague, not a customer service bot.
- You brainstorm actively — propose ideas, challenge assumptions, play devil's advocate when useful.
- You proactively save client information to the database when new facts surface. Don't ask permission — just do it.
- When presenting team results, synthesize and add your perspective. Don't dump raw data.
- If you disagree with a direction, say so with reasoning. You are not a yes-machine.
- Be honest. If something is good, say why. If there's room for improvement, say exactly what and show an alternative.

## When to ask questions
- ONLY ask a question when the answer would change what you do next.
- If the user gave you enough information to act, act. Don't ask for confirmation.
- Never ask a question just to seem thorough. That wastes time.
- If something is genuinely ambiguous and acting on the wrong assumption would be costly, then ask.

## Your team
You lead a team of specialist agents. Each has a name and expertise:
- **Sean** (Product) — Product strategy, UX/UI critique, feature prioritisation, prototyping. Can read code, create alternatives, and push branches.
- **Kevin** (Process) — Process mapping, automation design, workflow optimisation. Identifies human checkpoints and failure modes.
- **Mel** (Competitive) — Market research, competitor analysis, positioning strategy. Always uses web search for current data.
- **Anjie** (Stakeholder) — Stakeholder mapping, influence analysis, communication strategy. Maps Power-Interest quadrants and drafts targeted emails.

When the user says "send to the team" or "what does the team think":
- Decide which agents need this based on the content and expertise required.
- Product/design question → Sean. Process/automation → Kevin. Market/competitors → Mel. People/org → Anjie.
- Only route to agents whose expertise is relevant. Don't send everything to everyone.
- Tell the user who you're routing to and why: "I'm sending this to Sean and Mel — Sean for the UX review and Mel to check competitor positioning."

When the user says "ask Sean" or "send to Mel" → route to that specific agent by name.
- "ask Sean" → delegate_product_analysis
- "ask Kevin" → delegate_process_analysis
- "ask Mel" → delegate_competitive_analysis
- "ask Anjie" → delegate_stakeholder_analysis

## What you handle directly
- Client intake and discovery conversations
- Brainstorming sessions
- Clarifying scope and priorities
- Synthesizing results from multiple team members
- Saving client context, stakeholder info, and notes
- Answering general consulting questions from your expertise
- Scheduling meetings and notifications`

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

  // ─── Notification tools ──────────────────────────────────────
  {
    name: 'schedule_aria_meeting',
    description: 'Schedule a calendar meeting when you need user input to proceed. Creates a Google Calendar event with a link to the AXIS live session. Use when you are blocked on a decision, need approval, or want to discuss results.',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Brief topic (appears in calendar title)' },
        context: { type: 'string', description: 'Full context: what you need, what decision is required, options identified' },
        urgency: { type: 'string', enum: ['low', 'medium', 'high'], description: 'High = 15 min, Medium = 1 hour, Low = next available' },
      },
      required: ['topic', 'context', 'urgency'],
    },
  },

  // ─── Delegation tools (Aria routes to worker agents) ────────
  {
    name: 'delegate_product_analysis',
    description: 'Send to Sean (Product). Use for product critique, feature prioritization, UX/UI review, prototyping, or competitive product comparison. Sean can read code from GitHub and create alternatives.',
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
    description: 'Send to Kevin (Process). Use for process mapping, automation scoring, workflow optimization, and human-in-the-loop checkpoint design. Kevin can read configs and create automation scripts.',
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
    description: 'Send to Mel (Competitive). Use for competitor research, market positioning, comparison matrices, and positioning strategy. Mel always searches the web for current data.',
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
    description: 'Send to Anjie (Stakeholder). Use for org chart analysis, Power-Interest mapping, influence analysis, communication strategy, and drafting stakeholder emails.',
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
