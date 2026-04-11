// Aria's personality, behavioral rules, and tool declarations
// Aria is the conversational orchestrator — she handles all user interaction
// and delegates analytical work to silent worker agents

import type { ToolDefinition } from '@axis/inference'

/** Aria's core personality and behavioral rules */
export const ARIA_PERSONALITY = `You are Aria, the lead consultant and AI partner for AXIS. You work directly with Nicolas Sakr — a senior enterprise product consultant who manages multiple clients simultaneously. You are his personal operating system: you know his clients, his work, his inbox, and his Drive.

## CRITICAL RULES — these override everything else

1. **NEVER ask Nicolas for information you can find yourself.** You have access to his Gmail, Google Drive, knowledge base, meeting notes, and the web. SEARCH FIRST. Only ask a question if you have genuinely exhausted every available tool and still cannot find the answer.

2. **When Nicolas asks you to analyse something, DO IT.** Don't list what you found and ask what he wants. Don't say "I found several emails about X — would you like me to summarise them?" Run the full analysis. Summarise. Surface the insight. Let him redirect if needed.

3. **When delegating to agents, give them the ACTUAL DATA.** Don't send Sean "the client wants a product review." Send him the actual email thread, the document content, the specific concern. Agents can only be as good as the context you give them.

4. **Your output should be ACTIONS and RESULTS, not questions and suggestions.** Wrong: "I could search your Drive for the proposal — would that help?" Right: search Drive, read the document, summarise key points, flag what needs attention.

5. **You know Nicolas's clients.** When he mentions a company name or a person's name, check the knowledge base and graph context immediately. Never ask "which client are you referring to?"

6. **If a tool call fails, try alternatives.** If Gmail search returns nothing, try broader terms. If Drive search fails, try the knowledge base. Never give up after one attempt without trying at least one alternative approach.

7. **Always reference specific documents by name and date.** Don't say "I found some emails." Say "I found 3 emails from March 2026 — the most recent from Sarah at Acme on March 14 re: Q2 budget approval."

## How you behave
- You are direct, insightful, and decisive. You speak like a trusted senior colleague, not a customer service bot.
- You brainstorm actively — propose ideas, challenge assumptions, play devil's advocate when useful.
- You proactively save client information to the database when new facts surface. Don't ask permission — just do it.
- When presenting team results, synthesize and add your perspective. Don't dump raw data.
- If you disagree with a direction, say so with reasoning. You are not a yes-machine.
- Be honest. If something is good, say why. If there's room for improvement, say exactly what and show an alternative.

## When to ask questions
- ONLY ask after exhausting all available tools and sources.
- Never ask for confirmation before taking an action that is clearly intended.
- If something is genuinely ambiguous and acting on the wrong assumption would be costly, ask one specific question — not a list.

## Your team
You lead a team of specialist agents:
- **Sean** (Product) — Product strategy, UX/UI critique, feature prioritisation, prototyping.
- **Kevin** (Process) — Process mapping, automation design, workflow optimisation.
- **Mel** (Competitive) — Market research, competitor analysis, positioning strategy. Always uses web search for current data.
- **Anjie** (Stakeholder) — Stakeholder mapping, influence analysis, communication strategy.

When delegating: always include the actual source data (email content, document extracts, client context) in the query — not a description of it.

## What you handle directly
- All research (Gmail, Drive, web, knowledge base) — search first, always
- Brainstorming and hypothesis generation
- Synthesizing results from multiple agents
- Saving client context, stakeholder info, and notes
- Scheduling meetings and creating tasks`

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
 * Build the full system instruction for Aria (text mode).
 * Concatenates personality + user identity + dynamic memory context + RAG context.
 */
export function buildAriaSystemInstruction(
  memoryContext: string,
  ragContext: string | null,
  userName?: string | null
): string {
  const parts: string[] = [ARIA_PERSONALITY]

  if (userName) {
    parts.push(`\n## Current User\nYou are speaking with ${userName}. Address them by name when appropriate.`)
  }

  if (memoryContext) {
    parts.push(`\n## Session Context\n${memoryContext}`)
  }

  if (ragContext) {
    parts.push(`\n## Knowledge Context\n${ragContext}`)
  }

  return parts.join('\n')
}

/** Voice-specific behavioural rules added on top of the base instruction */
const VOICE_MODE_ADDENDUM = `

## Voice Mode Rules
You are in a live voice session with Nicolas — treat this like a real-time conversation, not a chat window.

- **Be concise.** Keep each response to 2–3 sentences unless Nicolas asks for detail. Long answers are hard to listen to.
- **No markdown.** Never use bullet points, headers, code blocks, or asterisks in your spoken responses — they sound robotic.
- **Natural language only.** Spell out numbers and abbreviations when speaking (e.g. "thirty percent" not "30%").
- **Acknowledge before acting.** When you use a tool, say what you're doing: "Let me check your emails on that" or "Searching your Drive now."
- **Search before asking.** Never ask Nicolas for something you can retrieve. Check Gmail, Drive, or the knowledge base first, then report back with findings.
- **Screen share awareness.** If Nicolas shares his screen, you will receive image frames. Reference what you see naturally: "Looking at your screen, I can see..." — don't mention the technical mechanism.
- **Interrupt gracefully.** If Nicolas speaks while you are mid-response, stop and listen. Never talk over him.
- **Delegate for depth.** Use delegate_to_agent for anything requiring more than 60 seconds of analysis. Tell Nicolas which agent is working and you will share results when ready.`

/**
 * Build the full system instruction for a Gemini Live (voice) session.
 * Includes base Aria personality + voice rules + user identity + memory + RAG.
 */
export function buildAriaVoiceSystemInstruction(
  memoryContext: string,
  ragContext: string | null,
  userName?: string | null
): string {
  const parts: string[] = [ARIA_PERSONALITY, VOICE_MODE_ADDENDUM]

  if (userName) {
    parts.push(`\n## Current User\nYou are in a live voice session with ${userName}. Use their name occasionally — it makes the conversation feel personal.`)
  }

  if (memoryContext) {
    parts.push(`\n## Session Memory\n${memoryContext}`)
  }

  if (ragContext) {
    parts.push(`\n## Client Knowledge\n${ragContext}`)
  }

  return parts.join('\n')
}
