import type { ToolDefinition, ToolFunction } from './types.js'

export const askClarificationDefinition: ToolDefinition = {
  name: 'ask_clarification',
  description: `Pause and ask the user ONE specific question when you are genuinely blocked.
Use ONLY when: (a) the answer cannot be found in the knowledge base, emails, Drive, or web AND (b) the answer materially changes your analysis output.
NEVER use for: confirmation questions, questions you can answer yourself, or optional enrichment.
Specialists: use this tool a MAXIMUM OF ONCE per task. Aria: only after all search tools are exhausted.`,
  inputSchema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The single specific question to ask the user',
      },
      context: {
        type: 'string',
        description: 'One sentence explaining why you need this — what fundamentally changes in your output if you know the answer',
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of 2–4 suggested answers for quick selection by the user',
      },
    },
    required: ['question', 'context'],
  },
}

// The execute function is intercepted in the agent loop before reaching toolRegistry.executeTool().
// This no-op is a safety fallback only — it should never be reached in production.
export const askClarification: ToolFunction = async (_input, _context) => ({
  success: true,
  data: { answer: '[No onAskUser callback available — continue with best available information]' },
  durationMs: 0,
})
