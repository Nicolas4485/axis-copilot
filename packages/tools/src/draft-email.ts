// draft_email — Uses InferenceEngine email_draft route (Claude Sonnet)
// Used by: StakeholderAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

export interface DraftEmailInput {
  stakeholderId: string
  purpose: string
  tone: 'formal' | 'friendly' | 'urgent' | 'follow-up'
  context: string
}

export const draftEmailDefinition: ToolDefinition = {
  name: 'draft_email',
  description: 'Draft an email for stakeholder communication. Uses Claude Sonnet via InferenceEngine for quality output, tailored to the stakeholder\'s role and influence level.',
  inputSchema: {
    type: 'object',
    properties: {
      stakeholderId: { type: 'string' },
      purpose: { type: 'string', description: 'What the email should accomplish' },
      tone: { type: 'string', enum: ['formal', 'friendly', 'urgent', 'follow-up'] },
      context: { type: 'string', description: 'Background context for the email' },
    },
    required: ['stakeholderId', 'purpose', 'tone', 'context'],
  },
}

export async function draftEmail(
  input: Record<string, unknown>,
  toolContext: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const stakeholderId = input['stakeholderId'] as string | undefined
  const purpose = input['purpose'] as string | undefined
  const tone = input['tone'] as string | undefined
  const emailContext = input['context'] as string | undefined

  if (!stakeholderId || !purpose || !tone || !emailContext) {
    return { success: false, data: null, error: 'stakeholderId, purpose, tone, and context are required', durationMs: Date.now() - start }
  }

  try {
    // TODO: Look up stakeholder details from DB
    // const stakeholder = await prisma.stakeholder.findUnique({
    //   where: { id: stakeholderId },
    // })
    const stakeholderName = 'Stakeholder' // Placeholder

    // Use InferenceEngine to draft via Claude Sonnet
    const { InferenceEngine } = await import('@axis/inference')
    const engine = new InferenceEngine()

    const response = await engine.route('user_email', {
      systemPromptKey: 'EMAIL_DRAFT',
      messages: [{
        role: 'user',
        content: `Draft an email with the following details:
Recipient: ${stakeholderName} (ID: ${stakeholderId})
Purpose: ${purpose}
Tone: ${tone}
Context: ${emailContext}`,
      }],
      sessionId: toolContext.sessionId,
      userId: toolContext.userId,
    })

    const emailText = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n')

    return {
      success: true,
      data: {
        stakeholderId,
        purpose,
        tone,
        email: emailText,
        model: response.model,
        tokensUsed: response.inputTokens + response.outputTokens,
      },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to draft email: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
