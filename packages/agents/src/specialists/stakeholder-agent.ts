// StakeholderAgent — Anjie, senior comms and account person
// CRO + Chief of Staff mindset. Maps interests, predicts objections,
// drafts communications tailored to each stakeholder's agenda.
// Uses Chris Voss-style mirroring and labeling in recommended messaging.

import { InferenceEngine } from '@axis/inference'
import type { InfiniteMemory } from '@axis/memory'
import type { RAGEngine } from '@axis/rag'
import { BaseAgent } from '../base-agent.js'
import type { AgentConfig } from '../types.js'

const STAKEHOLDER_CONFIG: AgentConfig = {
  name: 'Anjie',
  role: 'Senior Stakeholder Intelligence & Communications Specialist — Power-Interest mapping, coalition design, reads actual emails before advising, drafts communications not suggestions.',
  systemPromptKey: 'AGENT_STAKEHOLDER',
  tools: [
    'search_gmail',               // Always first — read actual correspondence before assessing any relationship
    'read_email',                 // Read full thread context: tone, history, commitments, objections
    'search_knowledge_base',      // Pull indexed meeting notes, prior stakeholder analyses, client context
    'get_org_chart',              // Formal org structure: reporting lines, span of control, decision authority
    'get_graph_context',          // Informal relationships: known alliances, cross-company connections
    'perplexity_search',          // Research stakeholder background, public statements, recent news before any outreach
    'web_search',                 // Fallback when Perplexity unavailable; additional stakeholder research
    'draft_email',                // Write the actual communication — not a suggestion of what to say
    'book_meeting',               // Schedule meetings with proposed agenda when conversation is required
    'save_stakeholder',           // Persist stakeholder profiles after every intake
    'update_stakeholder_influence', // Update influence/interest scores as positions shift
    'flag_for_review',            // Flag political risks, conflicting signals, and unverifiable claims
    'ask_clarification',          // ONE-TIME use: ask user a blocking question when answer materially changes analysis
  ],
  memoryTypes: ['EPISODIC', 'SEMANTIC', 'PROCEDURAL'], // PROCEDURAL: learns relationship patterns and corrections (3C.3)
}

export class StakeholderAgent extends BaseAgent {
  constructor(engine: InferenceEngine, memory?: InfiniteMemory, rag?: RAGEngine) {
    super(STAKEHOLDER_CONFIG, engine, memory, rag)
  }

  protected specialistOutputSchema(): string {
    return `Structure your response using EXACTLY these section headers (use ## for each):

## Stakeholder Map
| Name | Role | Power | Interest | Quadrant (Manage Closely / Keep Informed / Keep Satisfied / Monitor) |
For each stakeholder identified. Power and Interest: H/M/L.

## True Asks (vs. Stated Requests)
For EACH stakeholder, identify:
- **Stated ask**: What they said they want
- **True ask**: What they actually need (career protection, political credit, risk avoidance, etc.)
This is the most important section — surface the subtext.

## Predicted Objections
Per stakeholder: what will they push back on and why? Include the emotional driver, not just the rational one.

## Recommended Messaging Per Stakeholder
For each stakeholder: 2–3 sentences on HOW to communicate with them.
Apply Voss-style techniques:
- Mirroring: repeat the last 2–3 words of their concern as a question
- Labeling: "It seems like you're concerned about..." before making your point
- Calibrated questions: "How would you like us to handle X?"

## Drafted Communication
Write the actual email or message to the PRIMARY stakeholder identified.
Format: Subject line / To / Body.
Tone: professional but warm. Length: under 200 words.

## Suggested Next Touch
For each stakeholder: recommended channel (email/call/meeting), timing, and what to say. Include any political landmines to avoid.

---
CRITICAL RULE: Always identify the "true asks" beyond the stated request. Surface what each stakeholder is really protecting or pursuing.`
  }

  protected specialistReflectionCritique(): string {
    return `For this stakeholder analysis specifically:
- Is there enough context to identify each stakeholder's actual interests and motivations (not just their role)?
- Are there prior communication threads (emails, meeting notes) that reveal their position?
- Is the organisational hierarchy clear enough to place each stakeholder in the Power-Interest grid?
- Are there any relationships between stakeholders that would create political dynamics to navigate?
If any of these are missing, flag them in missingInfo.`
  }
}
