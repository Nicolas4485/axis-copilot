// analyze_image — Analyse an image (screenshot, wireframe, diagram)
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

export async function analyzeImage(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  // TODO: Call InferenceEngine.route('user_response') with image content block
  return {
    success: false,
    data: null,
    error: 'analyze_image not yet implemented',
    durationMs: Date.now() - start,
  }
}
