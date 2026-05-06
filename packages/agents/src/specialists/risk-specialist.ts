import { InferenceEngine } from '@axis/inference'

export interface RiskItem {
  title: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  category: 'OPERATIONAL' | 'FINANCIAL' | 'MARKET' | 'REGULATORY' | 'EXECUTION' | 'LEVERAGE'
  description: string
  mitigant: string
  residualRisk: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface RiskAnalysis {
  risks: RiskItem[]
  overallRiskRating: 'HIGH' | 'MEDIUM' | 'LOW'
  topThreeRisks: string[]
  dealBreakers: string[]
}

export function formatRiskBlock(analysis: RiskAnalysis): string {
  const header = `RISK ANALYSIS (pre-computed risk register — use as ground truth for all risk-related sections):

Overall Risk Rating: ${analysis.overallRiskRating}
Deal-Breakers (resolve before LOI): ${analysis.dealBreakers.length > 0 ? analysis.dealBreakers.join('; ') : 'None identified'}

Risk Register:`

  const rows = analysis.risks.map((r, i) =>
    `\n[${i + 1}] [${r.severity}] ${r.title} — ${r.category}
  Issue: ${r.description}
  Mitigant: ${r.mitigant}
  Residual: ${r.residualRisk}`
  ).join('\n')

  return header + rows
}

/**
 * Run risk analysis against the deal's RAG context.
 * Uses Qwen3 (agent_response route) — pipeline task, not user-facing.
 * Returns null on failure — never blocks memo generation.
 */
export async function runRiskAnalysis(
  companyName: string,
  ragContext: string,
  userId: string,
  engine: InferenceEngine
): Promise<RiskAnalysis | null> {
  try {
    const response = await engine.route('agent_response', {
      systemPromptKey: 'RISK_ANALYSIS',
      messages: [{
        role: 'user',
        content: `Identify and score all material risks for ${companyName}. Return ONLY valid JSON.\n\nDeal context:\n${ragContext.substring(0, 8000)}`,
      }],
      maxTokens: 1200,
      userId,
    })

    const text = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    return JSON.parse(jsonMatch[0]) as RiskAnalysis
  } catch {
    return null  // Never block memo generation
  }
}
