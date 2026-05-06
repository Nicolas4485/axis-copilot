import { InferenceEngine } from '@axis/inference'

export interface CommercialAnalysis {
  marketPosition: {
    assessment: 'LEADER' | 'CHALLENGER' | 'FOLLOWER' | 'NICHE'
    rationale: string
    keyDifferentiators: string[]
  }
  revenueQuality: {
    recurringPct: string
    topCustomerConcentration: string
    nrrSignal: string
    qualityRating: 'HIGH' | 'MEDIUM' | 'LOW'
    flags: string[]
  }
  growthDrivers: Array<{
    driver: string
    magnitude: 'HIGH' | 'MEDIUM' | 'LOW'
    evidence: string
  }>
  competitiveThreats: Array<{
    competitor: string
    threatLevel: 'HIGH' | 'MEDIUM' | 'LOW'
    mechanism: string
  }>
  exitBuyerUniverse: Array<{
    buyer: string
    type: 'STRATEGIC' | 'FINANCIAL' | 'IPO'
    rationale: string
  }>
  overallCommercialStrength: 'STRONG' | 'ADEQUATE' | 'WEAK'
}

export function formatCommercialBlock(analysis: CommercialAnalysis): string {
  const pos = analysis.marketPosition
  const rev = analysis.revenueQuality

  const drivers = analysis.growthDrivers
    .map((d) => `  [${d.magnitude}] ${d.driver} — ${d.evidence}`)
    .join('\n')

  const threats = analysis.competitiveThreats
    .map((t) => `  [${t.threatLevel}] ${t.competitor}: ${t.mechanism}`)
    .join('\n')

  const buyers = analysis.exitBuyerUniverse
    .map((b) => `  [${b.type}] ${b.buyer}: ${b.rationale}`)
    .join('\n')

  const revFlags = rev.flags.length > 0
    ? `\n  ⚠ ${rev.flags.join('\n  ⚠ ')}`
    : ''

  return `COMMERCIAL ANALYSIS (pre-computed structured findings — use as ground truth):

Market Position: ${pos.assessment} — ${pos.rationale}
Key Differentiators: ${pos.keyDifferentiators.join(' | ')}

Revenue Quality [${rev.qualityRating}]:
  Recurring Revenue: ${rev.recurringPct}
  Customer Concentration: ${rev.topCustomerConcentration}
  NRR Signal: ${rev.nrrSignal}${revFlags}

Top Growth Drivers:
${drivers}

Competitive Threats:
${threats}

Exit Buyer Universe:
${buyers}

Overall Commercial Strength: ${analysis.overallCommercialStrength}`
}

/**
 * Run commercial analysis against the deal's RAG context.
 * Uses Qwen3 (agent_response route) — pipeline task, not user-facing.
 * Returns null on failure — never blocks memo generation.
 */
export async function runCommercialAnalysis(
  companyName: string,
  ragContext: string,
  userId: string,
  engine: InferenceEngine
): Promise<CommercialAnalysis | null> {
  try {
    const response = await engine.route('agent_response', {
      systemPromptKey: 'COMMERCIAL_ANALYSIS',
      messages: [{
        role: 'user',
        content: `Analyze the commercial position of ${companyName}. Return ONLY valid JSON.\n\nDeal context:\n${ragContext.substring(0, 8000)}`,
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

    return JSON.parse(jsonMatch[0]) as CommercialAnalysis
  } catch {
    return null  // Never block memo generation
  }
}
