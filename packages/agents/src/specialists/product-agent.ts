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
  role: 'Senior Product Strategist — JTBD framing, differentiator vs. table stakes classification, named competitor comparisons, builds code PR or spec rather than describing it.',
  systemPromptKey: 'AGENT_PRODUCT',
  tools: [
    'search_knowledge_base',  // Pull prior product analyses, feature context, and client goals
    'get_competitive_context', // Named competitor feature comparisons for positioning decisions
    'get_graph_context',       // Feature dependency and entity relationships from knowledge graph
    'perplexity_search',       // Current SaaS benchmarks, NRR/ARR multiples, competitor features — cited live data
    'web_search',              // Fallback when Perplexity unavailable; additional market research
    'analyze_image',           // Analyse screenshots, wireframes, and mockups — always first step when image provided
    'github_list_repos',       // Discover what repos exist before diving into files
    'github_list_files',       // Explore repo structure before reading specific files
    'github_search_code',      // Check if a feature already exists before speccing it
    'github_read_file',        // Read existing code and components before proposing changes
    'github_create_branch',    // Create feature branch for improvements
    'github_write_file',       // Implement code improvements directly
    'github_create_pr',        // Submit PR with clear rationale
    'save_analysis',           // Persist structured product analyses and recommendations
    'draft_email',             // Draft stakeholder communications when findings need to be shared
    'flag_for_review',         // Flag unsubstantiated claims and assumptions
    'ask_clarification',       // ONE-TIME use: ask user a blocking question when answer materially changes analysis
    // ─── Browser tools (Phase B) — drive Mixpanel, Miro, Google Docs, Notion, etc. ───
    'browser_state',            // ALWAYS first when user says "this page" / "this dashboard" / "this doc"
    'browser_visit',            // Open a tool URL (Mixpanel report, Miro board) for interaction
    'browser_close',            // Clean up tabs after a flow completes
    'browser_scrape',           // One-shot read of a page (e.g., docs site, Stack Overflow answer)
    'browser_screenshot',       // Visual reasoning over rendered analytics, diagrams, mockups
    'browser_scroll',           // Scroll long dashboards / lists to load below-fold content
    'browser_click',            // Click filter buttons in Mixpanel, expand sections in Miro
    'browser_fill',             // Type into Notion docs, Google Docs comments, Mixpanel queries. Never auto-submits.
    'browser_key',              // Trusted keyboard input via chrome.debugger — Tab/Enter on Mixpanel queries, hotkeys on Notion (Ctrl+/), keyboard nav on Miro.
    // ─── Drive API editing (Option 3 — preferred over browser_fill on Docs) ───
    'search_google_drive',      // Find a product spec or PRD by name before editing it.
    'read_drive_document',      // Read the current spec to know what to find/replace.
    'update_drive_document',    // PREFER THIS over browser_fill on Drive-hosted Docs. Atomic find-and-replace via the official API. No Chrome banner. Returns replacement count.
  ],
  memoryTypes: ['EPISODIC', 'SEMANTIC', 'PROCEDURAL'], // PROCEDURAL: learns from analyst corrections (3C.3)
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
