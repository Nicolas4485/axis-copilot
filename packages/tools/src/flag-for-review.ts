// flag_for_review — Persist a review flag as a SYSTEM message on the session
// Used by: All agents

import type { PrismaClient } from '@prisma/client'
import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

let prismaInstance: PrismaClient | null = null

async function getPrisma(): Promise<PrismaClient> {
  if (!prismaInstance) {
    const { PrismaClient } = await import('@prisma/client')
    prismaInstance = new PrismaClient()
  }
  return prismaInstance
}

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
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const fact = input['fact'] as string | undefined
  const reason = input['reason'] as string | undefined
  const sessionId = (input['sessionId'] as string | undefined) ?? context.sessionId

  if (!fact || !reason) {
    return { success: false, data: null, error: 'fact and reason are required', durationMs: Date.now() - start }
  }

  try {
    const flagId = `flag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    const flag = {
      id: flagId,
      fact,
      reason,
      sessionId,
      userId: context.userId,
      clientId: context.clientId,
      timestamp: new Date().toISOString(),
      status: 'pending',
    }

    const db = await getPrisma()
    await db.message.create({
      data: {
        sessionId,
        role: 'SYSTEM',
        content: `FLAGGED FOR REVIEW: ${fact}\nReason: ${reason}`,
        metadata: flag,
      },
    })

    console.log(`[FlagForReview] ${flagId}: "${fact}" — ${reason}`)

    return {
      success: true,
      data: flag,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to flag for review: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
