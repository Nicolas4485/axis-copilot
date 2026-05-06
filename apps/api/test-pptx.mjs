// Quick test of pitch-deck-builder
import { buildPitchDeck } from './dist/lib/pitch-deck-builder.js'

const memo = {
  dealId: 'test-deal',
  companyName: 'NorthStar Software Corp',
  version: 1,
  generatedAt: new Date().toISOString(),
  durationMs: 1000,
  sections: [
    { id: 'executive_summary', title: 'Executive Summary', content: '**Company:** NorthStar Software Corp | **Sector:** Vertical SaaS\n\nRecommendation: PROCEED to Phase 2 Diligence\n\nNorthStar is a high-quality SaaS business.', generatedAt: new Date().toISOString() },
    { id: 'company_overview', title: 'Company Overview', content: '**HQ:** Austin, TX\n**Founded:** 2015\n**ARR:** $28.4M', generatedAt: new Date().toISOString() },
    { id: 'financial_analysis', title: 'Financial Analysis', content: '| Metric | 2022 | 2023 | 2024 |\n|---|---|---|---|\n| Revenue | $18M | $23M | $28.4M |\n| EBITDA | $4M | $5.5M | $8.2M |', generatedAt: new Date().toISOString() },
    { id: 'key_risks', title: 'Key Risks', content: '| Risk | Severity | Mitigation |\n|---|---|---|\n| Founder dependency | HIGH | Hire C-suite |\n| Unaudited financials | MEDIUM | Big 4 audit |', generatedAt: new Date().toISOString() },
    { id: 'investment_thesis', title: 'Investment Thesis', content: '- Strong ARR growth at 22% YoY\n- High gross margin at 78%\n- Sticky customer base with 93% GRR', generatedAt: new Date().toISOString() },
    { id: 'deal_structure', title: 'Deal Structure', content: '**Asking Price:** $90-100M\n**EBITDA Multiple:** 10.5-12.2x\n**Structure:** 100% equity acquisition', generatedAt: new Date().toISOString() },
    { id: 'market_analysis', title: 'Market Analysis', content: '- $4.2B TAM in field service management\n- 15% CAGR through 2028\n- Fragmented market with consolidation opportunity', generatedAt: new Date().toISOString() },
    { id: 'management_assessment', title: 'Management Assessment', content: '- CEO: 12 years industry experience\n- CFO: Prior PE-backed company exit\n- Strong technical team with low attrition', generatedAt: new Date().toISOString() },
    { id: 'next_steps', title: 'Next Steps', content: '1. Engage Big 4 for financial audit\n2. Legal DD on customer contracts\n3. Management presentation Q3 2025', generatedAt: new Date().toISOString() },
  ],
}

try {
  const buf = await buildPitchDeck(memo)
  console.log('SUCCESS! Buffer size:', buf.length, 'bytes')
  import('fs').then(fs => fs.writeFileSync('/tmp/test-deck.pptx', buf))
} catch (err) {
  console.error('FAILED:', err.message)
  console.error(err.stack)
}
