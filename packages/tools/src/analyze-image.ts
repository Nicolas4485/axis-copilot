// analyze_image — Claude Sonnet vision analysis
// Used by: ProductAgent

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

export interface AnalyzeImageInput {
  base64Image: string
  analysisType: 'ui_critique' | 'wireframe_review' | 'diagram_analysis' | 'general'
}

export const analyzeImageDefinition: ToolDefinition = {
  name: 'analyze_image',
  description: 'Analyse an image (screenshot, wireframe, or diagram) using Claude Sonnet vision. Returns structured analysis based on the specified analysis type.',
  inputSchema: {
    type: 'object',
    properties: {
      base64Image: { type: 'string', description: 'Base64-encoded image data' },
      analysisType: {
        type: 'string',
        enum: ['ui_critique', 'wireframe_review', 'diagram_analysis', 'general'],
        description: 'Type of analysis to perform',
      },
    },
    required: ['base64Image', 'analysisType'],
  },
}

const ANALYSIS_PROMPTS: Record<string, string> = {
  ui_critique: 'Analyse this UI screenshot. Evaluate: visual hierarchy, accessibility, usability issues, information architecture, and call-to-action clarity. Provide specific, actionable recommendations.',
  wireframe_review: 'Review this wireframe. Evaluate: layout structure, user flow, information grouping, interaction patterns, and missing elements. Suggest improvements.',
  diagram_analysis: 'Analyse this diagram (architecture, flow, org chart, etc.). Identify: components, relationships, bottlenecks, missing connections, and potential improvements.',
  general: 'Describe and analyse this image in detail. Identify key elements, patterns, and any insights relevant to product or business analysis.',
}

export async function analyzeImage(
  input: Record<string, unknown>,
  toolContext: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const base64Image = input['base64Image'] as string | undefined
  const analysisType = (input['analysisType'] as string | undefined) ?? 'general'

  if (!base64Image) {
    return { success: false, data: null, error: 'base64Image is required', durationMs: Date.now() - start }
  }

  try {
    // Use Anthropic SDK directly for vision (InferenceEngine doesn't handle image blocks)
    const apiKey = process.env['ANTHROPIC_API_KEY']
    if (!apiKey) {
      return { success: false, data: null, error: 'ANTHROPIC_API_KEY not configured', durationMs: Date.now() - start }
    }

    // Detect media type from base64 header
    const mediaType = base64Image.startsWith('/9j/') ? 'image/jpeg'
      : base64Image.startsWith('iVBOR') ? 'image/png'
      : base64Image.startsWith('R0lGO') ? 'image/gif'
      : 'image/png'

    const analysisPrompt = ANALYSIS_PROMPTS[analysisType] ?? ANALYSIS_PROMPTS['general']

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6-20250514',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Image },
            },
            { type: 'text', text: analysisPrompt },
          ],
        }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, data: null, error: `Vision API error: ${response.status} ${errorText}`, durationMs: Date.now() - start }
    }

    const data = await response.json() as Record<string, unknown>
    const content = data['content'] as Array<Record<string, unknown>> | undefined
    const analysis = content
      ?.filter((b) => b['type'] === 'text')
      .map((b) => b['text'] as string)
      .join('\n') ?? 'No analysis generated'

    const usage = data['usage'] as Record<string, unknown> | undefined

    void toolContext

    return {
      success: true,
      data: {
        analysisType,
        analysis,
        tokensUsed: ((usage?.['input_tokens'] as number) ?? 0) + ((usage?.['output_tokens'] as number) ?? 0),
      },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Image analysis failed: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
