// StakeholderAgent — stakeholder mapping and communication specialist
// Cross-references with meeting transcripts from knowledge graph
// ALWAYS maps to Power-Interest quadrant
// ALWAYS suggests communication approach per stakeholder

import { InferenceEngine } from '@axis/inference'
import { BaseAgent } from '../base-agent.js'
import type { AgentConfig } from '../types.js'

const STAKEHOLDER_CONFIG: AgentConfig = {
  name: 'StakeholderAgent',
  role: 'Stakeholder Mapping & Communication Specialist',
  systemPromptKey: 'AGENT_STAKEHOLDER',
  tools: [
    'save_stakeholder',
    'get_org_chart',
    'draft_email',
    'update_stakeholder_influence',
    'web_search',
    'search_knowledge_base',
    'get_graph_context',
    'flag_for_review',
  ],
  memoryTypes: ['EPISODIC', 'SEMANTIC'],
}

export class StakeholderAgent extends BaseAgent {
  constructor(engine: InferenceEngine) {
    super(STAKEHOLDER_CONFIG, engine)
  }
}
