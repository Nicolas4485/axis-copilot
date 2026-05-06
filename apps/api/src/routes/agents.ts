// Agent Management routes
// CRUD for AgentDefinition records + AI-powered agent generation
// GET    /api/agents          — list all agents for user (built-in + custom)
// GET    /api/agents/:key     — get single agent definition
// POST   /api/agents          — create custom agent
// PATCH  /api/agents/:key     — update agent (prompt, tools, manifest)
// DELETE /api/agents/:key     — deactivate agent (built-in = 403)
// POST   /api/agents/generate — AI generates agent definition from description

import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { InferenceEngine, getPromptText } from '@axis/inference'

export const agentsRouter = Router()
const engine = new InferenceEngine()

// Built-in agents — source of truth is this array + prompt-library.ts.
// ensureBuiltInAgents UPSERTS on every GET so code changes always propagate to the DB.
const BUILT_IN_AGENTS = [
  {
    key: 'AGENT_INTAKE',
    name: 'Aria',
    persona: 'Lead Consultant & Operating System — researches via Gmail, Drive, web, and KB before asking; pre-populates client and deal records; delegates with full source data included',
    tier: 'AGENT' as const,
    tools: ['search_gmail', 'read_email', 'search_google_drive', 'web_search', 'search_knowledge_base', 'get_graph_context', 'save_client_context', 'update_client_record', 'flag_for_review', 'browser_state', 'browser_visit', 'browser_close', 'browser_scrape', 'browser_screenshot'],
    mdManifest: `# Aria — Lead Consultant & Operating System\n\n## Role\nLead consultant and personal AI partner. Researches clients proactively before asking Nicolas anything. Orchestrates all specialist agents.\n\n## Priority Order\n1. Search Gmail for existing correspondence\n2. Search Google Drive for existing documents\n3. Search knowledge base for indexed context\n4. Search web to research independently\n5. Only ask Nicolas if all four return nothing\n\n## Capabilities\n- Pre-populate client and deal records from open sources\n- Identify sector, ownership structure, known financials before intake call\n- Delegate to Sean, Kevin, Mel, Anjie, Alex with raw source data included\n- Flag data conflicts between sources before presenting\n\n## Output Schema\nResearch Summary → Client Record (pre-populated) → Open Questions → Delegation Plan`,
  },
  {
    key: 'AGENT_PRODUCT',
    name: 'Sean',
    persona: 'Senior Product Strategist — JTBD framing, distinguishes differentiators from table stakes, compares against named competitors, builds the improvement (code PR or spec) rather than describing it',
    tier: 'AGENT' as const,
    tools: ['search_knowledge_base', 'get_competitive_context', 'get_graph_context', 'web_search', 'analyze_image', 'github_read_file', 'github_create_branch', 'github_write_file', 'github_create_pr', 'save_analysis', 'draft_email', 'flag_for_review', 'browser_state', 'browser_visit', 'browser_close', 'browser_scrape', 'browser_screenshot', 'browser_scroll', 'browser_click', 'browser_fill'],
    mdManifest: `# Sean — Senior Product Strategist\n\n## Role\nProduct Strategy & Critique Specialist. Says exactly what is wrong and builds the alternative.\n\n## Framework (applied to every review)\n1. Problem Clarity — specific and measurable?\n2. Solution Fit — addresses root cause or solution looking for a problem?\n3. Competitive Position — ahead, at parity, or a competitor is already there?\n4. Build vs. Buy vs. Partner — is building right, or does a faster path exist?\n5. Success Criteria — what does "working" look like at 30/60/90 days?\n\n## Rules\n- Distinguish: DIFFERENTIATOR / TABLE STAKES / NICE TO HAVE\n- State opportunity cost of not acting\n- Compare against 2–3 named competitors with specific feature differences\n- When image provided: describe before critiquing\n- When improvements found: create code PR, not a description\n\n## Output Schema\nProblem → Competitive Position → Verdict (DIFFERENTIATOR/TABLE STAKES/NICE TO HAVE) → Improvement (code or spec) → Success Metrics`,
  },
  {
    key: 'AGENT_PROCESS',
    name: 'Kevin',
    persona: 'Senior Process & Automation Consultant — quantifies friction, maps current/future state in swim-lane format, scores automation candidates 0–100, builds the blueprint not just the recommendation',
    tier: 'AGENT' as const,
    tools: ['search_knowledge_base', 'get_graph_context', 'github_read_file', 'github_write_file', 'create_automation_blueprint', 'save_process_analysis', 'create_task', 'web_search', 'flag_for_review', 'ingest_document', 'browser_state', 'browser_visit', 'browser_close', 'browser_scrape', 'browser_screenshot', 'browser_scroll', 'browser_click', 'browser_fill'],
    mdManifest: `# Kevin — Senior Process & Automation Consultant\n\n## Role\nProcess & Automation Specialist. Finds where workflows break, quantifies the cost, and builds the fix.\n\n## Framework (applied in sequence)\n1. MAP — current state swim-lane: steps, actors, systems, decision points, handoffs\n2. MEASURE — quantify friction: wait time, error rate, manual hours. Top 3 bottlenecks by cost.\n3. REDESIGN — future state: steps eliminated, automated, or resequenced\n4. AUTOMATE — score candidates 0–100 (feasibility × impact); build blueprints for >70\n5. GOVERN — KPIs: what does "working" look like 90 days post-launch?\n\n## Rules\n- Quantify before recommending — label estimates as [ESTIMATED]\n- Always include human-in-the-loop checkpoints with rationale\n- Always flag failure modes and recovery paths\n- Read existing code before proposing rewrites\n- Separate quick wins (<2 weeks) from strategic improvements (1–6 months)\n\n## Output Schema\nCurrent State Map → Bottleneck Analysis → Future State → Automation Scores → Blueprint → Task List`,
  },
  {
    key: 'AGENT_COMPETITIVE',
    name: 'Mel',
    persona: 'Senior Competitive Intelligence Analyst — McKinsey/PE standard; market structure analysis, asymmetric advantage mapping, positioning gap identification, single specific strategic recommendation',
    tier: 'AGENT' as const,
    tools: ['web_search', 'search_knowledge_base', 'get_market_context', 'get_competitive_context', 'get_graph_context', 'generate_comparison_matrix', 'save_competitor', 'flag_for_review', 'browser_state', 'browser_visit', 'browser_close', 'browser_scrape', 'browser_screenshot', 'browser_scroll', 'browser_click', 'browser_fill'],
    mdManifest: `# Mel — Senior Competitive Intelligence Analyst\n\n## Role\nCompetitive Intelligence Specialist. Web-first — never relies on stale indexed data.\n\n## CI Framework (applied to every analysis)\n1. Market Structure — top 3–5 players, collective share, consolidating or fragmenting?\n2. Positioning Gaps — overserving (features no one wants), underserving (unaddressed pain), ignoring (adjacent segments)?\n3. Asymmetric Advantages — what can't be replicated in 12 months: patents, exclusive data, network effects, regulatory licenses?\n4. Strategic Threat Model — which competitor could destroy the client's position in 3 years, and exactly how?\n\n## Rules\n- Source every material claim with URL, date, and publication\n- Quantify market share with methodology stated\n- Generate comparison matrix for every competitive review\n- Save every named competitor to knowledge graph\n- End with one POSITIONING RECOMMENDATION — specific action, not a range\n- Flag conflicting market data explicitly — never average silently\n\n## Output Schema\nMarket Structure → Asymmetric Advantage Map → Comparison Matrix → Positioning Gaps → Strategic Recommendation`,
  },
  {
    key: 'AGENT_STAKEHOLDER',
    name: 'Anjie',
    persona: 'Senior Stakeholder Intelligence & Communications Specialist — Kotter/McKinsey Change standard; Power-Interest mapping, coalition design, drafts actual communications not suggestions',
    tier: 'AGENT' as const,
    tools: ['search_gmail', 'read_email', 'search_knowledge_base', 'get_org_chart', 'get_graph_context', 'web_search', 'draft_email', 'book_meeting', 'save_stakeholder', 'update_stakeholder_influence', 'flag_for_review', 'browser_state', 'browser_visit', 'browser_close', 'browser_scrape', 'browser_screenshot', 'browser_scroll', 'browser_click', 'browser_fill'],
    mdManifest: `# Anjie — Senior Stakeholder Intelligence & Communications Specialist\n\n## Role\nStakeholder Intelligence & Communication Specialist. Understands how decisions actually get made.\n\n## Framework (applied to every engagement)\n1. Power-Interest Map — High/Low Power × High/Low Interest: blockers, champions, bystanders\n2. Interest Analysis — stated position vs. underlying interest; what they gain/risk; competing demands\n3. Coalition Design — minimum coalition to reach yes; swing votes; what changes their position\n4. Communication Plan — specific message, channel, timing, owner for each key stakeholder\n\n## Rules\n- Read Gmail and Drive first — never ask Nicolas before checking his inbox\n- Distinguish stated position from underlying interest\n- Draft the actual email via draft_email — not a suggestion of what to say\n- Book meetings when conversation is required — propose the agenda\n- Save every stakeholder; update influence scores as positions shift\n- Flag political risks: name the person, the risk, the specific derailment scenario\n\n## Output Schema\nPower-Interest Map → Interest Analysis → Coalition Path → Communication Plan → Drafted Communications → Political Risks`,
  },
  {
    key: 'AGENT_DUE_DILIGENCE',
    name: 'Alex',
    persona: 'Senior PE Due Diligence Analyst — Blackstone/KKR associate standard; evaluates Revenue Quality, EBITDA Add-Back Audit, Market Position, Competitive Moat, Customer Concentration, LBO Feasibility, Management, Deal Risks, and IC Questions',
    tier: 'AGENT' as const,
    tools: ['search_knowledge_base', 'get_graph_context', 'web_search', 'get_market_context', 'get_competitive_context', 'save_analysis', 'flag_for_review', 'browser_state', 'browser_visit', 'browser_close', 'browser_scrape', 'browser_screenshot', 'browser_scroll', 'browser_click', 'browser_fill'],
    mdManifest: `# Alex — Senior PE Due Diligence Analyst\n\n## Role\nPE Due Diligence Specialist at Blackstone/KKR associate standard. Finds what the CIM is hiding before the firm commits capital.\n\n## Analytical Framework\n1. Revenue Quality — recurring/project/one-time decomposition; NRR; cohort retention by vintage year; organic growth stripped of M&A\n2. EBITDA Quality & Add-Back Audit — classification table: run-rate/policy/transactional/discretionary; add-backs >15% = red flag; normalized EBITDA reconciliation\n3. Market & Competitive Position — TAM/SAM with implied market share math; single competitor that could destroy this business in 3 years\n4. Competitive Moat — 5 dimensions scored: switching costs, network effects, data/IP, contractual lock-in, distribution advantage\n5. Customer Concentration & Retention — EBITDA impact if top customer churns; any >20% = HIGH SEVERITY red flag\n6. LBO/Returns Feasibility — value creation attribution: EBITDA growth vs. multiple expansion vs. debt paydown; downside covenant test at −20% EBITDA\n7. Management Assessment — track record vs. own historical budgets; depth scoring 1–5 per executive; specific "what breaks" key-person scenario\n8. Deal Risks — minimum 6 risks, HIGH severity risks quantified with deal-specific evidence\n9. IC Diligence Questions — exactly 10, each referencing a specific gap or page in THIS document\n\n## Output Schema\nRevenue Quality → EBITDA Quality → Market Position → Moat → Customer Concentration → LBO Feasibility → Management → Risks → IC Questions → Preliminary Verdict (PASS/PROCEED/STRONG PROCEED)`,
  },
] as const

// Always upsert built-in agents so code changes propagate to the DB immediately.
// systemPromptText is intentionally excluded from update — sync-agents.ts is the sole
// authority for system prompts to prevent hot-reload issues from overwriting DB state.
async function ensureBuiltInAgents(userId: string) {
  for (const agent of BUILT_IN_AGENTS) {
    await prisma.agentDefinition.upsert({
      where: { userId_key: { userId, key: agent.key } },
      update: {
        name:       agent.name,
        persona:    agent.persona,
        tools:      agent.tools as unknown as string[],
        mdManifest: agent.mdManifest,
        isBuiltIn:  true,
        isActive:   true,
      },
      create: {
        userId,
        key:              agent.key,
        name:             agent.name,
        persona:          agent.persona,
        tier:             agent.tier,
        systemPromptText: getPromptText(agent.key),
        tools:            agent.tools as unknown as string[],
        mdManifest:       agent.mdManifest,
        isBuiltIn:        true,
        isActive:         true,
      },
    })
  }
}

const CreateAgentSchema = z.object({
  key:              z.string().min(1).max(50).regex(/^[A-Z_]+$/),
  name:             z.string().min(1).max(50),
  persona:          z.string().min(1).max(500),
  tier:             z.enum(['MICRO', 'TASK', 'AGENT']).optional(),
  systemPromptText: z.string().min(10).max(8000),
  tools:            z.array(z.string()).default([]),
  mdManifest:       z.string().max(10000).optional(),
})

const UpdateAgentSchema = z.object({
  name:             z.string().min(1).max(50).optional(),
  persona:          z.string().min(1).max(500).optional(),
  systemPromptText: z.string().min(10).max(8000).optional(),
  tools:            z.array(z.string()).optional(),
  mdManifest:       z.string().max(10000).nullable().optional(),
  isActive:         z.boolean().optional(),
})

const GenerateAgentSchema = z.object({
  description: z.string().min(10).max(2000),
})

// ─── Routes ──────────────────────────────────────────────────────

/**
 * GET /api/agents — list all agents for the user
 */
agentsRouter.get('/', async (req: Request, res: Response) => {
  try {
    await ensureBuiltInAgents(req.userId!)
    const agents = await prisma.agentDefinition.findMany({
      where: { userId: req.userId! },
      orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
    })
    res.json({ agents, requestId: req.requestId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to list agents', code: 'AGENT_LIST_ERROR', details: msg, requestId: req.requestId })
  }
})

/**
 * GET /api/agents/:key — get single agent definition
 */
agentsRouter.get('/:key', async (req: Request, res: Response) => {
  try {
    await ensureBuiltInAgents(req.userId!)
    const agent = await prisma.agentDefinition.findUnique({
      where: { userId_key: { userId: req.userId!, key: req.params['key']! } },
    })
    if (!agent) {
      res.status(404).json({ error: 'Agent not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }
    res.json({ agent, requestId: req.requestId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch agent', code: 'AGENT_FETCH_ERROR', details: msg, requestId: req.requestId })
  }
})

/**
 * POST /api/agents — create a custom agent
 */
agentsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = CreateAgentSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    // Prevent key collision
    const existing = await prisma.agentDefinition.findUnique({
      where: { userId_key: { userId: req.userId!, key: parsed.data.key } },
    })
    if (existing) {
      res.status(409).json({ error: 'Agent key already exists', code: 'KEY_CONFLICT', requestId: req.requestId })
      return
    }

    const agent = await prisma.agentDefinition.create({
      data: {
        userId:           req.userId!,
        key:              parsed.data.key,
        name:             parsed.data.name,
        persona:          parsed.data.persona,
        tier:             parsed.data.tier ?? 'AGENT',
        systemPromptText: parsed.data.systemPromptText,
        tools:            parsed.data.tools,
        mdManifest:       parsed.data.mdManifest ?? null,
        isBuiltIn:        false,
        isActive:         true,
      },
    })

    res.status(201).json({ agent, requestId: req.requestId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to create agent', code: 'AGENT_CREATE_ERROR', details: msg, requestId: req.requestId })
  }
})

/**
 * PATCH /api/agents/:key — update an agent's prompt, tools, or manifest
 */
agentsRouter.patch('/:key', async (req: Request, res: Response) => {
  try {
    const key = req.params['key']!
    const existing = await prisma.agentDefinition.findUnique({
      where: { userId_key: { userId: req.userId!, key } },
    })
    if (!existing) {
      res.status(404).json({ error: 'Agent not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    const parsed = UpdateAgentSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const data: Record<string, unknown> = {}
    if (parsed.data.name             !== undefined) data['name']             = parsed.data.name
    if (parsed.data.persona          !== undefined) data['persona']          = parsed.data.persona
    if (parsed.data.systemPromptText !== undefined) data['systemPromptText'] = parsed.data.systemPromptText
    if (parsed.data.tools            !== undefined) data['tools']            = parsed.data.tools
    if (parsed.data.mdManifest       !== undefined) data['mdManifest']       = parsed.data.mdManifest
    if (parsed.data.isActive         !== undefined) data['isActive']         = parsed.data.isActive

    const agent = await prisma.agentDefinition.update({
      where: { userId_key: { userId: req.userId!, key } },
      data,
    })

    res.json({ agent, requestId: req.requestId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to update agent', code: 'AGENT_UPDATE_ERROR', details: msg, requestId: req.requestId })
  }
})

/**
 * DELETE /api/agents/:key — deactivate a custom agent (built-in = 403)
 */
agentsRouter.delete('/:key', async (req: Request, res: Response) => {
  try {
    const key = req.params['key']!
    const existing = await prisma.agentDefinition.findUnique({
      where: { userId_key: { userId: req.userId!, key } },
    })
    if (!existing) {
      res.status(404).json({ error: 'Agent not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }
    if (existing.isBuiltIn) {
      res.status(403).json({ error: 'Cannot delete built-in agents', code: 'BUILT_IN_PROTECTED', requestId: req.requestId })
      return
    }

    await prisma.agentDefinition.update({
      where: { userId_key: { userId: req.userId!, key } },
      data: { isActive: false },
    })

    res.json({ success: true, requestId: req.requestId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to delete agent', code: 'AGENT_DELETE_ERROR', details: msg, requestId: req.requestId })
  }
})

/**
 * POST /api/agents/generate — AI generates an agent definition from a description
 * Returns: { key, name, persona, systemPromptText, tools, mdManifest }
 */
agentsRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const parsed = GenerateAgentSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const availableTools = [
      'search_knowledge_base', 'get_graph_context', 'web_search',
      'draft_email', 'save_analysis', 'save_competitor', 'save_stakeholder',
      'save_process_analysis', 'get_competitive_context', 'get_org_chart',
      'generate_comparison_matrix', 'flag_for_review', 'analyze_image',
      'github_read_file', 'github_create_branch', 'github_write_file', 'github_create_pr',
    ]

    const metaPrompt = `You are an expert at designing AI agent system prompts for a consulting co-pilot platform.

The user wants to create a new specialist agent. Generate a complete agent definition based on their description.

Available tools: ${availableTools.join(', ')}

User description: "${parsed.data.description}"

Return ONLY valid JSON (no markdown, no explanation):
{
  "key": "AGENT_KEYNAME_IN_SCREAMING_SNAKE_CASE",
  "name": "Single first name (e.g. Maya, Jordan, Sam)",
  "persona": "One-sentence role description (under 150 chars)",
  "tier": "AGENT",
  "systemPromptText": "Full system prompt under 800 tokens. Must include: role statement, 5-8 RULES in uppercase, and OUTPUT format description. Follow the pattern of AXIS specialist agents — direct, action-oriented, no fluff.",
  "tools": ["tool_name_1", "tool_name_2"],
  "mdManifest": "# Name — Agent Title\\n\\n## Role\\n...\\n\\n## Capabilities\\n- ...\\n\\n## Output Schema\\n..."
}

Rules for the system prompt:
- Name the agent with a persona (e.g. "You are Maya, the Financial Analysis specialist on the AXIS team")
- Include RULES in uppercase with clear instructions
- End with OUTPUT: describing exactly what the agent produces
- Stay under 800 tokens
- Select only relevant tools from the available list`

    const result = await engine.route('user_report', {
      systemPromptKey: 'AGENT_GENERATE',
      messages: [{ role: 'user', content: metaPrompt }],
      sessionId: 'agent-gen',
      userId: req.userId!,
    })

    // Parse the JSON from the response
    let generated: {
      key: string
      name: string
      persona: string
      tier: string
      systemPromptText: string
      tools: string[]
      mdManifest: string
    }
    try {
      const textBlock = result.content.find((b) => b.type === 'text')
      const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found in response')
      generated = JSON.parse(jsonMatch[0]) as typeof generated
    } catch {
      res.status(500).json({ error: 'Failed to parse generated agent definition', code: 'PARSE_ERROR', requestId: req.requestId })
      return
    }

    // Validate generated key doesn't conflict
    const keyExists = await prisma.agentDefinition.findUnique({
      where: { userId_key: { userId: req.userId!, key: generated.key } },
    })
    if (keyExists) {
      generated.key = `${generated.key}_${Date.now()}`
    }

    res.json({ generated, requestId: req.requestId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to generate agent', code: 'AGENT_GENERATE_ERROR', details: msg, requestId: req.requestId })
  }
})
