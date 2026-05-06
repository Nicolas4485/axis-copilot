'use client'

// OutputFeedback — attach this to any agent output to enable the correction learning loop.
// When a correction is submitted, it's immediately stored as PROCEDURAL memory and
// retrieved in future generations — the agent learns from the edit without model retraining.
//
// Usage:
//   <OutputFeedback
//     agentKey="AGENT_DUE_DILIGENCE"
//     outputType="cim_analysis"
//     outputRef="business_quality"
//     dealId={deal.id}
//     originalText={section.content}
//   />

import { useState } from 'react'
import { ThumbsUp, ThumbsDown, Pencil, Check, X, Loader2, MessageSquare } from 'lucide-react'

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'

interface OutputFeedbackProps {
  agentKey:     string
  outputType:   string
  outputRef?:   string
  sessionId?:   string
  dealId?:      string
  originalText: string
  compact?:     boolean   // show only icons, no labels
}

type Rating = 1 | 2 | 3 | 4  // 1=wrong, 2=ok, 3=good, 4=excellent
type Step = 'idle' | 'rating' | 'correction' | 'submitting' | 'done'

export function OutputFeedback({
  agentKey, outputType, outputRef, sessionId, dealId, originalText, compact = false,
}: OutputFeedbackProps) {
  const [step, setStep]             = useState<Step>('idle')
  const [rating, setRating]         = useState<Rating | null>(null)
  const [correctedText, setCorrectedText] = useState('')
  const [comment, setComment]       = useState('')
  const [error, setError]           = useState<string | null>(null)

  async function submit(r: Rating, corrected?: string, note?: string) {
    setStep('submitting')
    setError(null)
    try {
      await fetch(`${API_BASE}/api/feedback`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentKey,
          outputType,
          outputRef,
          sessionId,
          dealId,
          rating: r,
          originalText,
          correctedText: corrected || undefined,
          comment: note || undefined,
        }),
      })
      setStep('done')
    } catch {
      setError('Failed to save — try again')
      setStep('correction')
    }
  }

  function handleRating(r: Rating) {
    setRating(r)
    if (r <= 2) {
      // Wrong or just ok — open correction panel
      setStep('correction')
    } else {
      // Good or excellent — submit immediately
      submit(r)
    }
  }

  if (step === 'done') {
    return (
      <div className="flex items-center gap-1.5 text-xs py-1" style={{ color: '#34d399' }}>
        <Check size={12} />
        <span>{rating && rating <= 2 ? 'Correction saved — Aria will learn from this' : 'Thanks for the feedback'}</span>
      </div>
    )
  }

  if (step === 'idle') {
    return (
      <div className="flex items-center gap-2 mt-2">
        {!compact && (
          <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.4)' }}>Was this helpful?</span>
        )}
        <button
          onClick={() => handleRating(4)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all hover:bg-white/5"
          style={{ color: 'rgba(148,163,184,0.5)' }}
          title="Excellent"
        >
          <ThumbsUp size={12} />
          {!compact && <span>Good</span>}
        </button>
        <button
          onClick={() => setStep('rating')}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all hover:bg-white/5"
          style={{ color: 'rgba(148,163,184,0.5)' }}
          title="Needs improvement"
        >
          <ThumbsDown size={12} />
          {!compact && <span>Improve</span>}
        </button>
        <button
          onClick={() => { setRating(2); setStep('correction') }}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all hover:bg-white/5"
          style={{ color: 'rgba(148,163,184,0.5)' }}
          title="Edit output"
        >
          <Pencil size={12} />
          {!compact && <span>Edit</span>}
        </button>
      </div>
    )
  }

  if (step === 'rating') {
    return (
      <div className="mt-2 p-3 rounded-xl space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Rate this output:</p>
        <div className="flex gap-2">
          {([
            { r: 1 as Rating, label: 'Wrong',     colour: '#f87171' },
            { r: 2 as Rating, label: 'OK',         colour: '#fbbf24' },
            { r: 3 as Rating, label: 'Good',       colour: '#60a5fa' },
            { r: 4 as Rating, label: 'Excellent',  colour: '#34d399' },
          ]).map(({ r, label, colour }) => (
            <button
              key={r}
              onClick={() => handleRating(r)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-90"
              style={{ background: `${colour}18`, color: colour, border: `1px solid ${colour}30` }}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setStep('idle')} className="text-[10px]" style={{ color: 'rgba(148,163,184,0.3)' }}>
          Cancel
        </button>
      </div>
    )
  }

  if (step === 'correction' || step === 'submitting') {
    return (
      <div className="mt-2 p-3 rounded-xl space-y-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
            {rating && rating <= 2 ? 'What should it have said?' : 'Edit to improve:'}
          </p>
          <button onClick={() => setStep('idle')}>
            <X size={12} style={{ color: 'rgba(148,163,184,0.3)' }} />
          </button>
        </div>

        <textarea
          value={correctedText}
          onChange={(e) => setCorrectedText(e.target.value)}
          placeholder="Paste or type the correct version…"
          rows={5}
          className="w-full px-3 py-2 rounded-lg text-xs font-mono resize-none"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--text-primary)',
            lineHeight: '1.6',
          }}
        />

        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional note: why this is better…"
          className="w-full px-3 py-1.5 rounded-lg text-xs"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--text-primary)',
          }}
        />

        {error && (
          <p className="text-[11px]" style={{ color: '#f87171' }}>{error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => submit(rating ?? 2, correctedText, comment)}
            disabled={step === 'submitting'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'var(--gold)', color: '#000', opacity: step === 'submitting' ? 0.7 : 1 }}
          >
            {step === 'submitting'
              ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
              : <><Check size={11} /> Save correction</>}
          </button>
          {correctedText && (
            <p className="self-center text-[10px]" style={{ color: 'rgba(148,163,184,0.4)' }}>
              Aria will learn from this immediately
            </p>
          )}
        </div>
      </div>
    )
  }

  return null
}
