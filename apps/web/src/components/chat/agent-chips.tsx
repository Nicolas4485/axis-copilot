'use client'

import { Sparkles } from 'lucide-react'

// ─── Suggestion definitions per mode ─────────────────────────

const SUGGESTIONS: Record<string, string[]> = {
  intake: [
    'What are your main pain points?',
    'Describe your current tech stack',
    'Who are the key decision makers?',
    'What does success look like in 6 months?',
    'What have you already tried?',
  ],
  product: [
    'Prioritise these features for me',
    'What are the biggest risks?',
    'How does this compare to competitors?',
    'What does the ideal user journey look like?',
    'Identify quick wins vs strategic bets',
  ],
  process: [
    'Map out the current workflow',
    'Where are the biggest bottlenecks?',
    'What can be automated?',
    'Who owns each step?',
    'What tools are in use today?',
  ],
  competitive: [
    'Who are the top 3 competitors?',
    'What is our differentiation?',
    'Identify whitespace opportunities',
    'What are competitors doing well?',
    'Build a SWOT analysis',
  ],
  stakeholder: [
    'Map all stakeholders by influence',
    'Who are the blockers?',
    'Draft a stakeholder communication plan',
    'Identify champions vs sceptics',
    'What are each stakeholder\'s goals?',
  ],
}

const DEFAULT_SUGGESTIONS = [
  'Summarise what we know so far',
  'What should I ask next?',
  'Create an action plan',
  'What are the key risks?',
]

// ─── Props ────────────────────────────────────────────────────

interface AgentChipsProps {
  mode?: string
  onSelect: (suggestion: string) => void
  disabled?: boolean
}

// ─── Component ───────────────────────────────────────────────

export function AgentChips({ mode, onSelect, disabled = false }: AgentChipsProps) {
  const suggestions = (mode !== undefined && mode in SUGGESTIONS)
    ? (SUGGESTIONS[mode] ?? DEFAULT_SUGGESTIONS)
    : DEFAULT_SUGGESTIONS

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Sparkles size={12} className="text-[var(--gold)] shrink-0" />
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          onClick={() => onSelect(suggestion)}
          disabled={disabled}
          className="px-2.5 py-1 text-xs rounded-full border border-[var(--border)] text-[var(--text-secondary)]
                     hover:border-[var(--gold)]/40 hover:text-[var(--gold)] hover:bg-[var(--gold)]/5
                     transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}
