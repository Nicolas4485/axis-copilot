// SDK specialist agent definitions — Sean, Mel, Kevin, Anjie as AgentDefinition objects.
// Prompts are imported from the existing prompt library (single source of truth).

import { getPromptText } from '@axis/inference'
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk'
import { competitiveSlice, productSlice, processSlice, stakeholderSlice } from './tool-slices.js'
import type { AxisToolEntry } from './mcp-tool-bridge.js'

const MCP_SERVER = 'axis-tools'

function toToolNames(slice: ReadonlyArray<AxisToolEntry>): string[] {
  return slice.map((e) => `mcp__${MCP_SERVER}__${e.definition.name}`)
}

/**
 * Builds the four specialist AgentDefinition objects for the SDK.
 * Each specialist inherits the parent MCP server but is restricted to its own tool slice.
 * Prompts are reused unchanged from packages/inference/src/prompt-library.ts.
 */
export function buildSpecialistDefinitions(): Record<string, AgentDefinition> {
  return {
    'mel-competitive': {
      description: 'Senior competitive intelligence analyst. Market analysis, battlecards, competitor positioning, pricing comparisons.',
      prompt: getPromptText('AGENT_COMPETITIVE'),
      tools: toToolNames(competitiveSlice),
      model: 'sonnet',
    },
    'sean-product': {
      description: 'Senior product strategist. JTBD analysis, RICE scoring, feature prioritisation, roadmaps, UX critique, GitHub code reviews.',
      prompt: getPromptText('AGENT_PRODUCT'),
      tools: toToolNames(productSlice),
      model: 'sonnet',
    },
    'kevin-process': {
      description: 'Process and automation specialist. Workflow mapping, bottleneck analysis, RACI design, automation blueprints.',
      prompt: getPromptText('AGENT_PROCESS'),
      tools: toToolNames(processSlice),
      model: 'sonnet',
    },
    'anjie-stakeholder': {
      description: 'Stakeholder intelligence specialist. Power-interest mapping, communication strategy, email drafting, coalition design.',
      prompt: getPromptText('AGENT_STAKEHOLDER'),
      tools: toToolNames(stakeholderSlice),
      model: 'sonnet',
    },
  }
}
