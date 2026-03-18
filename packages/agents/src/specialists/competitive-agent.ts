// CompetitiveAgent — competitive intelligence and market analysis specialist
// ALWAYS uses web_search for current data
// Cross-references web results with indexed docs
// ALWAYS ends with specific positioning recommendation

import { InferenceEngine } from '@axis/inference'
import { BaseAgent } from '../base-agent.js'
import type { AgentConfig } from '../types.js'

const COMPETITIVE_CONFIG: AgentConfig = {
  name: 'CompetitiveAgent',
  role: 'Competitive Intelligence & Market Analysis Specialist',
  systemPromptKey: 'AGENT_COMPETITIVE',
  tools: [
    'web_search',
    'save_competitor',
    'get_market_context',
    'generate_comparison_matrix',
    'search_knowledge_base',
    'get_graph_context',
    'flag_for_review',
  ],
  memoryTypes: ['EPISODIC', 'SEMANTIC'],
}

export class CompetitiveAgent extends BaseAgent {
  constructor(engine: InferenceEngine) {
    super(COMPETITIVE_CONFIG, engine)
  }
}
