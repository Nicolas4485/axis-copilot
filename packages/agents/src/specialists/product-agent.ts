// ProductAgent — Sean, senior product strategist
// Thinks in JTBD framing, opportunity solution trees, RICE prioritisation.
// Always validates whether the problem is worth solving before jumping to solutions.

import { InferenceEngine } from '@axis/inference'
import type { InfiniteMemory } from '@axis/memory'
import type { RAGEngine } from '@axis/rag'
import { BaseAgent } from '../base-agent.js'
import type { AgentConfig } from '../types.js'

const PRODUCT_CONFIG: AgentConfig = {
  name: 'Sean',
  role: 'Product Strategy & Critique Specialist',
  systemPromptKey: 'AGENT_PRODUCT',
  // Preferred tools listed first — search_knowledge_base for product context,
  // get_graph_context for feature relationships, web_search for benchmarks
  tools: [
    'search_knowledge_base',
    'get_graph_context',
    'web_search',
    'draft_email',
    'save_analysis',
    'get_competitive_context',
    'flag_for_review',
    'analyze_image',
    'github_read_file',
    'github_create_branch',
    'github_write_file',
    'github_create_pr',
  ],
  memoryTypes: ['EPISODIC', 'SEMANTIC'],
}

export class ProductAgent extends BaseAgent {
  constructor(engine: InferenceEngine, memory?: InfiniteMemory, rag?: RAGEngine) {
    super(PRODUCT_CONFIG, engine, memory, rag)
  }

  protected specialistOutputSchema(): string {
    return `Structure your response using EXACTLY these section headers (use ## for each):

## Problem
What specific user problem are we solving? Who experiences it and how often? Is this problem validated or assumed?

## Users
Who are the primary users? What are their current workarounds or coping mechanisms? Include any relevant segments.

## Hypothesis
State the core testable assumption: "We believe [action] will result in [outcome] for [user segment], evidenced by [metric]."

## Solution Sketch
Concrete approach — not vague descriptions. What specifically would be built or changed? Include trade-offs vs. alternatives.

## Success Metrics
How will we know this worked? List 2-3 measurable outcomes (lead and lag metrics). Propose a north-star metric where relevant.

## Risks
Top 2-3 risks (technical, market, adoption) with a mitigation for each.

---
CRITICAL RULE: Before writing the Solution Sketch, explicitly answer in the Problem section: "Is this problem worth solving?" State why or why not based on evidence. Never jump straight to solutions.`
  }

  protected specialistReflectionCritique(): string {
    return `For this product analysis specifically:
- Does the evidence reveal the actual user problem, or just a feature request?
- Is there enough context to assess whether this problem is worth solving (frequency, severity, user count)?
- Is there competitive benchmark data to compare the proposed approach against?
If any of these are missing, flag them in missingInfo.`
  }
}
