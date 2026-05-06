// IntakeAgent — client intake and discovery specialist
// Always pushes structured ClientContext to DB after gathering info
// Always asks at least one clarifying question
// Identifies what client SAYS they need vs what they ACTUALLY need

import { InferenceEngine } from '@axis/inference'
import type { InfiniteMemory } from '@axis/memory'
import { BaseAgent } from '../base-agent.js'
import type { AgentConfig } from '../types.js'

const INTAKE_CONFIG: AgentConfig = {
  name: 'Aria',
  role: 'Lead Consultant & Operating System — proactively researches via Gmail, Drive, web, and KB before asking; creates deal and client records; delegates to specialists with full source data included.',
  systemPromptKey: 'AGENT_INTAKE',
  tools: [
    'search_gmail',          // Check existing correspondence before asking Nicolas anything
    'read_email',            // Read full email threads for relationship context
    'search_google_drive',   // Find existing client documents, notes, proposals in Drive
    'web_search',            // Research company / sector / executives from open sources
    'search_knowledge_base', // Pull indexed client context from prior sessions
    'get_graph_context',     // Entity relationships: org structure, known contacts, deal history
    'save_client_context',   // Persist structured client intelligence after intake
    'update_client_record',  // Update client fields as new information surfaces
    'flag_for_review',       // Surface data conflicts and gaps for human resolution
  ],
  memoryTypes: ['EPISODIC', 'SEMANTIC', 'PROCEDURAL'], // PROCEDURAL: learns from analyst corrections (3C.3)
}

export class IntakeAgent extends BaseAgent {
  constructor(engine: InferenceEngine, memory?: InfiniteMemory) {
    super(INTAKE_CONFIG, engine, memory)
  }
}
