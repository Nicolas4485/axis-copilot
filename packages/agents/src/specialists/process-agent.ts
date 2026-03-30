// ProcessAgent — process analysis and automation specialist
// ALWAYS includes human-in-the-loop checkpoints with justification
// ALWAYS flags failure modes for each automation point
// Outputs ProcessStep records for every identified step

import { InferenceEngine } from '@axis/inference'
import type { InfiniteMemory } from '@axis/memory'
import { BaseAgent } from '../base-agent.js'
import type { AgentConfig } from '../types.js'

const PROCESS_CONFIG: AgentConfig = {
  name: 'Kevin',
  role: 'Process Analysis & Automation Specialist',
  systemPromptKey: 'AGENT_PROCESS',
  tools: [
    'web_search',
    'save_process_analysis',
    'create_automation_blueprint',
    'search_knowledge_base',
    'get_graph_context',
    'flag_for_review',
    'ingest_document',
    'github_read_file',
    'github_write_file',
  ],
  memoryTypes: ['EPISODIC', 'SEMANTIC', 'PROCEDURAL'],
}

export class ProcessAgent extends BaseAgent {
  constructor(engine: InferenceEngine, memory?: InfiniteMemory) {
    super(PROCESS_CONFIG, engine, memory)
  }
}
