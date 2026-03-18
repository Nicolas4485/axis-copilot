// IntakeAgent — client intake and discovery specialist
// Always pushes structured ClientContext to DB after gathering info
// Always asks at least one clarifying question
// Identifies what client SAYS they need vs what they ACTUALLY need

import { InferenceEngine } from '@axis/inference'
import { BaseAgent } from '../base-agent.js'
import type { AgentConfig } from '../types.js'

const INTAKE_CONFIG: AgentConfig = {
  name: 'IntakeAgent',
  role: 'Client Intake & Discovery Specialist',
  systemPromptKey: 'AGENT_INTAKE',
  tools: [
    'save_client_context',
    'search_knowledge_base',
    'update_client_record',
    'get_graph_context',
    'flag_for_review',
  ],
  memoryTypes: ['EPISODIC', 'SEMANTIC'],
}

export class IntakeAgent extends BaseAgent {
  constructor(engine: InferenceEngine) {
    super(INTAKE_CONFIG, engine)
  }
}
