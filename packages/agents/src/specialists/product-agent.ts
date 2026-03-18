// ProductAgent — product strategy and critique specialist
// When image provided, analyse before responding
// Always states priority order with reasoning
// Always compares to at least one known competitor

import { InferenceEngine } from '@axis/inference'
import { BaseAgent } from '../base-agent.js'
import type { AgentConfig } from '../types.js'

const PRODUCT_CONFIG: AgentConfig = {
  name: 'ProductAgent',
  role: 'Product Strategy & Critique Specialist',
  systemPromptKey: 'AGENT_PRODUCT',
  tools: [
    'web_search',
    'save_analysis',
    'get_competitive_context',
    'search_knowledge_base',
    'get_graph_context',
    'flag_for_review',
  ],
  memoryTypes: ['EPISODIC', 'SEMANTIC'],
}

export class ProductAgent extends BaseAgent {
  constructor(engine: InferenceEngine) {
    super(PRODUCT_CONFIG, engine)
  }
}
