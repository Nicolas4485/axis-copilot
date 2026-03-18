// flag_for_review — Flag a fact or claim for human review
// Used by: All agents

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

export interface FlagForReviewInput {
  fact: string
  reason: string
  sessionId: string
}

export const flagForReviewDefinition: ToolDefinition = {
  name: 'flag_for_review',
  description: 'Flag a fact, claim, or data point for human review. Use when information seems uncertain, contradictory, or could have significant impact if wrong.',
  inputSchema: {
    type: 'object',
    properties: {
      fact: { type: 'string', description: 'The fact or claim to flag' },
      reason: { type: 'string', description: 'Why this needs human review' },
      sessionId: { type: 'string' },
    },
    required: ['fact', 'reason', 'sessionId'],
  },
}

export async function flagForReview(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  // TODO: Store flag as a message with role SYSTEM in the session
  // TODO: Include in session summary for visibility
  return {
    success: false,
    data: null,
    error: 'flag_for_review not yet implemented',
    durationMs: Date.now() - start,
  }
}
