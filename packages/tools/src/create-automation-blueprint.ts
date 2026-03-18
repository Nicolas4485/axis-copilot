// create_automation_blueprint — Creates ProcessStep records from analysis
// Used by: ProcessAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

export interface CreateAutomationBlueprintInput {
  analysisId: string
  steps: Array<{
    stepName: string
    automationApproach: string
    estimatedEffort: string
    prerequisites: string[]
  }>
}

export const createAutomationBlueprintDefinition: ToolDefinition = {
  name: 'create_automation_blueprint',
  description: 'Generate an automation blueprint from a process analysis. Maps each step to an automation approach with effort estimates.',
  inputSchema: {
    type: 'object',
    properties: {
      analysisId: { type: 'string', description: 'Analysis ID to build blueprint from' },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            stepName: { type: 'string' },
            automationApproach: { type: 'string' },
            estimatedEffort: { type: 'string' },
            prerequisites: { type: 'array', items: { type: 'string' } },
          },
          required: ['stepName', 'automationApproach', 'estimatedEffort', 'prerequisites'],
        },
      },
    },
    required: ['analysisId', 'steps'],
  },
}

export async function createAutomationBlueprint(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const analysisId = input['analysisId'] as string | undefined
  const steps = input['steps'] as Array<Record<string, unknown>> | undefined

  if (!analysisId || !steps || steps.length === 0) {
    return { success: false, data: null, error: 'analysisId and steps are required', durationMs: Date.now() - start }
  }

  try {
    // TODO: Validate analysisId exists
    // const analysis = await prisma.analysis.findUnique({ where: { id: analysisId } })
    // if (!analysis) return { success: false, ... }

    // TODO: Create ProcessStep records for each step
    // for (let i = 0; i < steps.length; i++) {
    //   await prisma.processStep.create({
    //     data: {
    //       analysisId,
    //       stepName: steps[i].stepName,
    //       automationScore: estimateScore(steps[i].automationApproach),
    //       agentType: steps[i].automationApproach,
    //       humanCheckpoint: steps[i].prerequisites.length > 0,
    //       humanCheckpointReason: steps[i].prerequisites.join(', '),
    //       order: i + 1,
    //     },
    //   })
    // }

    const processedSteps = steps.map((s, i) => ({
      order: i + 1,
      stepName: s['stepName'] as string,
      automationApproach: s['automationApproach'] as string,
      estimatedEffort: s['estimatedEffort'] as string,
      prerequisites: s['prerequisites'] as string[],
    }))

    return {
      success: true,
      data: {
        analysisId,
        blueprintId: `bp_${Date.now()}`,
        stepCount: processedSteps.length,
        steps: processedSteps,
      },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to create blueprint: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
