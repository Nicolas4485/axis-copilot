// ProcessAgent — Kevin, ops/process engineer
// Toyota Production System + lean thinking. Maps current vs. future state,
// identifies waste, proposes RACI and SOPs. Always flags highest-leverage interventions.

import { InferenceEngine } from '@axis/inference'
import type { InfiniteMemory } from '@axis/memory'
import type { RAGEngine } from '@axis/rag'
import { BaseAgent } from '../base-agent.js'
import type { AgentConfig } from '../types.js'

const PROCESS_CONFIG: AgentConfig = {
  name: 'Kevin',
  role: 'Senior Process & Automation Consultant — quantifies friction, MAP/MEASURE/REDESIGN/AUTOMATE/GOVERN framework, scores automation candidates 0-100, builds blueprints.',
  systemPromptKey: 'AGENT_PROCESS',
  tools: [
    'search_knowledge_base',      // Pull existing process docs, SOPs, and prior analyses from KB
    'get_graph_context',          // Process node dependencies and system relationships
    'github_read_file',           // Read existing code before proposing rewrites — never redesign blind
    'github_write_file',          // Implement automation scripts and config files directly
    'create_automation_blueprint', // Persist structured automation design for implementation handoff
    'save_process_analysis',      // Save structured process maps and findings
    'create_task',                // Create action items with owner and deadline for every recommendation
    'web_search',                 // Research automation tools, integration patterns, industry benchmarks
    'flag_for_review',            // Flag high-risk automation points requiring human oversight
    'ingest_document',            // Ingest process diagrams, SOPs, or architecture docs for analysis
    'ask_clarification',          // ONE-TIME use: ask user a blocking question when answer materially changes analysis
    // ─── Browser tools (Phase B) — research SaaS dashboards, automation tool docs, vendor sites ───
    'browser_state',              // Inspect what Nicolas is currently looking at before suggesting a redesign
    'browser_visit',              // Open vendor docs / SaaS dashboards for verification
    'browser_close',              // Clean up tabs after a flow completes
    'browser_scrape',             // One-shot read of automation-tool documentation, integration guides
    'browser_screenshot',         // Capture rendered automation flows / dashboards for visual reference
    'browser_scroll',             // Long docs, vendor pricing pages
    'browser_click',              // Interact with vendor demo / docs
    'browser_fill',               // Type into vendor search/filter (never auto-submits)
  ],
  memoryTypes: ['EPISODIC', 'SEMANTIC', 'PROCEDURAL'], // PROCEDURAL: remembers past process patterns and corrections
}

export class ProcessAgent extends BaseAgent {
  constructor(engine: InferenceEngine, memory?: InfiniteMemory, rag?: RAGEngine) {
    super(PROCESS_CONFIG, engine, memory, rag)
  }

  protected specialistOutputSchema(): string {
    return `Structure your response using EXACTLY these section headers (use ## for each):

## Current State
Map the process as it exists today — every step, handoff, and decision point. Note cycle time, error rate, or volume where known.

## Pain Points
What breaks, slows down, or creates rework? List as "waste type: description" (e.g., "Waiting: approval emails take 2–3 days").

## Root Cause
For each major pain point, identify the structural cause (not symptoms). Use "5 Whys" framing where applicable.

## Future State
What does the improved process look like? Map the new flow. Note what is eliminated, automated, or restructured.

## Owners (RACI)
| Step | Responsible | Accountable | Consulted | Informed |
List the top 3–5 steps that need clear ownership.

## Implementation Steps
Numbered, sequenced actions to get from current to future state. Each step: what, who, when, dependencies.

## Success Metrics
How will you know the process is improved? Include at least one efficiency metric (time/cost saved) and one quality metric (error rate, satisfaction).

---
CRITICAL RULE: After the Implementation Steps, add a "## Highest-Leverage Interventions" section listing exactly 3 interventions ranked by effort/impact:
Format: "1. [Intervention] — Effort: H/M/L | Impact: H/M/L | Why: [one sentence]"`
  }

  protected specialistReflectionCritique(): string {
    return `For this process analysis specifically:
- Is there enough information to map the current-state flow (actors, steps, handoffs)?
- Are failure modes and bottlenecks identifiable from the evidence?
- Is there data on cycle times, error rates, or volumes that would sharpen the recommendations?
If any of these are missing, flag them in missingInfo.`
  }
}
