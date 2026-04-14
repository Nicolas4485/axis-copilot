// CompetitiveAgent — Mel, competitive intelligence analyst
// Battlecard-style output. Always cites sources with dates.
// Treats anything older than 6 months as stale and flags it.
// Heavy web_search usage — never relies solely on indexed knowledge.

import { InferenceEngine } from '@axis/inference'
import type { InfiniteMemory } from '@axis/memory'
import type { RAGEngine } from '@axis/rag'
import { BaseAgent } from '../base-agent.js'
import type { AgentConfig } from '../types.js'

const COMPETITIVE_CONFIG: AgentConfig = {
  name: 'Mel',
  role: 'Competitive Intelligence & Market Analysis Specialist',
  systemPromptKey: 'AGENT_COMPETITIVE',
  // web_search FIRST — Mel always checks current data before indexed knowledge
  tools: [
    'web_search',
    'search_knowledge_base',
    'get_market_context',
    'generate_comparison_matrix',
    'get_competitive_context',
    'get_graph_context',
    'save_competitor',
    'flag_for_review',
  ],
  memoryTypes: ['EPISODIC', 'SEMANTIC'],
}

export class CompetitiveAgent extends BaseAgent {
  constructor(engine: InferenceEngine, memory?: InfiniteMemory, rag?: RAGEngine) {
    super(COMPETITIVE_CONFIG, engine, memory, rag)
  }

  protected specialistOutputSchema(): string {
    return `For EACH competitor identified, produce a battlecard using EXACTLY these sections (use ### for competitor name, ## for section headers):

### [Competitor Name]

## Profile
One paragraph: who they are, founding year, funding/revenue if known, target market. Cite source and date.

## Positioning
Their stated value proposition and how they position vs. the market. Quote their own marketing language where possible.

## Strengths
3–5 bullet points. Evidence-backed — not opinions. Each bullet cites a source and date.

## Weaknesses
3–5 bullet points. Look for product gaps, pricing complaints, support issues, or market blind spots. Cite evidence.

## Their Angle vs. Ours
Direct comparison: where they win, where we win, where it's unclear. Be specific — "they win on X because..." not vague claims.

## Threat Level
**H / M / L** — with one-sentence justification.

## Recommended Response
One specific, actionable counter-move. Not "improve our product" — name exactly what to do and why it neutralises this competitor's advantage.

---
CRITICAL RULES:
- Every factual claim must have a source citation formatted as [Source, Month YYYY]
- Mark any source older than 6 months with ⚠️ STALE
- End with a ## Strategic Summary section: overall positioning recommendation in 2–3 sentences`
  }

  protected specialistReflectionCritique(): string {
    return `For this competitive analysis specifically:
- Are all web sources dated? Flag any undated sources in missingInfo.
- Is any source older than 6 months? These should be treated as potentially stale.
- Is there direct pricing, feature, or market share data, or only general descriptions?
- Is there information about how the client currently positions against these competitors?
If any of these are missing, flag them in missingInfo.`
  }
}
