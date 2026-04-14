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
  role: 'Process Analysis & Automation Specialist',
  systemPromptKey: 'AGENT_PROCESS',
  // Preferred tools: search_knowledge_base for existing process docs,
  // get_graph_context for process node dependencies, create_task for action items
  tools: [
    'search_knowledge_base',
    'get_graph_context',
    'create_task',
    'save_process_analysis',
    'create_automation_blueprint',
    'web_search',
    'flag_for_review',
    'ingest_document',
    'github_read_file',
    'github_write_file',
  ],
  memoryTypes: ['EPISODIC', 'SEMANTIC', 'PROCEDURAL'],
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
