import { buildPitchDeck } from './src/lib/pitch-deck-builder.js'
import * as fs from 'fs'

const memo = {
  dealId: 'test-deal',
  companyName: 'NorthStar Software Corp',
  version: 1,
  generatedAt: new Date().toISOString(),
  durationMs: 1000,
  sections: [
    { id: 'executive_summary', title: 'Executive Summary', content: '**Company:** NorthStar | Recommendation: PROCEED', generatedAt: new Date().toISOString() },
    { id: 'company_overview', title: 'Company Overview', content: '**HQ:** Austin, TX\n**ARR:** $28.4M', generatedAt: new Date().toISOString() },
    { id: 'financial_analysis', title: 'Financial Analysis', content: '| Metric | 2023 | 2024 |\n|---|---|---|\n| Revenue | $23M | $28.4M |\n| EBITDA | $5.5M | $8.2M |', generatedAt: new Date().toISOString() },
    { id: 'key_risks', title: 'Key Risks', content: '- Founder dependency\n- Unaudited financials', generatedAt: new Date().toISOString() },
    { id: 'investment_thesis', title: 'Investment Thesis', content: '- 22% YoY ARR growth\n- 78% gross margin', generatedAt: new Date().toISOString() },
    { id: 'deal_structure', title: 'Deal Structure', content: '**Asking Price:** $90-100M', generatedAt: new Date().toISOString() },
    { id: 'market_analysis', title: 'Market Analysis', content: '- $4.2B TAM\n- 15% CAGR', generatedAt: new Date().toISOString() },
    { id: 'management_assessment', title: 'Management Assessment', content: '- CEO 12 years experience', generatedAt: new Date().toISOString() },
    { id: 'next_steps', title: 'Next Steps', content: '1. Financial audit\n2. Legal DD', generatedAt: new Date().toISOString() },
  ],
}

buildPitchDeck(memo as any)
  .then(buf => {
    console.log('SUCCESS! Buffer size:', buf.length, 'bytes')
    fs.writeFileSync('C:/Users/sakrn/Documents/test-deck.pptx', buf)
    console.log('Saved to C:/Users/sakrn/Documents/test-deck.pptx')
  })
  .catch(err => {
    console.error('FAILED:', err.message)
    console.error(err.stack)
  })
