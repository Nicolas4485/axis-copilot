'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Play, CheckCircle2, XCircle, AlertTriangle,
  Loader2, BarChart3, Brain,
} from 'lucide-react'

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'

// ─── Types ────────────────────────────────────────────────────

type QuestionCategory =
  | 'financial-figures' | 'risk-flags' | 'company-facts'
  | 'lbo-analysis' | 'pe-workflow'
  | 'competitive-intel' | 'product-strategy' | 'process-ops'
  | 'stakeholder-mgmt' | 'intake-discovery'

type AgentAlias = 'alex' | 'mel' | 'sean' | 'kevin' | 'anjie' | 'aria'

interface QuestionResult {
  id: string
  category: QuestionCategory
  agentTarget: AgentAlias
  question: string
  answer: string
  context: string
  contextQuality: number
  answerFaithfulness: number
  answerRelevance: number
  contextRecall?: number
  latencyMs: number
  error?: string
}

interface CategorySummary {
  category: QuestionCategory
  count: number
  contextQuality: number
  answerFaithfulness: number
  answerRelevance: number
  contextRecall?: number
  passRate: number
}

interface EvalResult {
  runId: string
  runAt: string
  durationMs: number
  totalQuestions: number
  contextQuality: number
  answerFaithfulness: number
  answerRelevance: number
  contextRecall?: number
  passRate: number
  categories: CategorySummary[]
  questions: QuestionResult[]
  passed: boolean
}

// ─── Constants ─────────────────────────────────────────────────

const T = {
  contextQuality:     0.85,
  answerFaithfulness: 0.90,
  answerRelevance:    0.80,
  contextRecall:      0.80,
}

const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  'financial-figures': 'Financial Figures',
  'risk-flags':        'Risk Flags',
  'company-facts':     'Company Facts',
  'lbo-analysis':      'LBO Analysis',
  'pe-workflow':       'PE Workflow',
  'competitive-intel': 'Competitive Intel',
  'product-strategy':  'Product Strategy',
  'process-ops':       'Process Ops',
  'stakeholder-mgmt':  'Stakeholder Mgmt',
  'intake-discovery':  'Intake Discovery',
}

const AGENT_LABELS: Record<AgentAlias, string> = {
  alex:  'Alex — Due Diligence',
  mel:   'Mel — Competitive Intel',
  sean:  'Sean — Product Strategy',
  kevin: 'Kevin — Process Ops',
  anjie: 'Anjie — Stakeholder Mgmt',
  aria:  'Aria — Intake',
}

// ─── Components ───────────────────────────────────────────────

function MetricBar({
  label,
  value,
  threshold,
}: {
  label: string
  value: number
  threshold: number
}) {
  const pct = Math.round(value * 100)
  const pass = value >= threshold
  const close = value >= threshold * 0.9
  const barColor = pass ? '#34d399' : close ? '#fbbf24' : '#f87171'
  const textColor = pass ? 'text-emerald-500' : close ? 'text-amber-500' : 'text-red-400'

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-[#334155] font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold tabular-nums ${textColor}`}>{pct}%</span>
          <span className="text-xs text-[#94A3B8]">/ {Math.round(threshold * 100)}%</span>
          {pass
            ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            : <XCircle className="w-4 h-4 text-red-400" />}
        </div>
      </div>
      <div className="w-full h-2 bg-[#F0F4FF] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <div className="relative" style={{ marginLeft: `${Math.round(threshold * 100)}%` }}>
        <div className="w-px h-2 bg-[#94A3B8] absolute top-0 -translate-x-1/2" />
      </div>
    </div>
  )
}

function CategoryCard({ cat }: { cat: CategorySummary }) {
  const label = CATEGORY_LABELS[cat.category] ?? cat.category
  const passColor = cat.passRate >= 0.8 ? 'text-emerald-500' : cat.passRate >= 0.6 ? 'text-amber-500' : 'text-red-400'

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-[#0F172A]">{label}</span>
        <span className="text-xs text-[#94A3B8]">{cat.count} questions</span>
      </div>
      <div className="space-y-2 mb-3">
        <MetricBar label="Context Quality"    value={cat.contextQuality}     threshold={T.contextQuality} />
        <MetricBar label="Ans. Faithfulness"  value={cat.answerFaithfulness} threshold={T.answerFaithfulness} />
        <MetricBar label="Ans. Relevance"     value={cat.answerRelevance}    threshold={T.answerRelevance} />
        {cat.contextRecall !== undefined && (
          <MetricBar label="Context Recall"   value={cat.contextRecall}      threshold={T.contextRecall} />
        )}
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-[#F1F5F9]">
        <span className="text-xs text-[#94A3B8]">Pass rate:</span>
        <span className={`text-sm font-bold ${passColor}`}>{Math.round(cat.passRate * 100)}%</span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function RagEvalPage() {
  const [phase, setPhase]   = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 150, question: '', pct: 0 })
  const [result, setResult] = useState<EvalResult | null>(null)
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [maxQ, setMaxQ]           = useState(150)
  const [category, setCategory]   = useState<QuestionCategory | 'all'>('all')
  const [agentTarget, setAgentTarget] = useState<AgentAlias | 'all'>('all')
  const [showFailingOnly, setShowFailingOnly] = useState(false)
  const [expandedQ, setExpandedQ] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const runEval = useCallback(async () => {
    setPhase('running')
    setResult(null)
    setErrorMsg(null)
    setProgress({ done: 0, total: maxQ, question: '', pct: 0 })

    abortRef.current = new AbortController()

    try {
      const res = await fetch(`${API_BASE}/api/admin/rag-eval`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxQuestions: maxQ,
          categories:   category    !== 'all' ? [category]    : undefined,
          agentTarget:  agentTarget !== 'all' ? agentTarget   : undefined,
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          try {
            const evt = JSON.parse(line.slice(5).trim()) as Record<string, unknown>
            if (evt['type'] === 'progress') {
              setProgress({
                done:     Number(evt['done'] ?? 0),
                total:    Number(evt['total'] ?? maxQ),
                question: String(evt['question'] ?? ''),
                pct:      Number(evt['pct'] ?? 0),
              })
            } else if (evt['type'] === 'done') {
              setResult(evt['result'] as EvalResult)
              setPhase('done')
            } else if (evt['type'] === 'error') {
              setErrorMsg(String(evt['message'] ?? 'Evaluation failed'))
              setPhase('error')
            }
          } catch { /* skip malformed events */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setErrorMsg((err as Error).message)
        setPhase('error')
      }
    }
  }, [maxQ, category, agentTarget])

  const passes = (q: QuestionResult) =>
    q.contextQuality >= T.contextQuality &&
    q.answerFaithfulness >= T.answerFaithfulness &&
    q.answerRelevance >= T.answerRelevance

  const failingQuestions  = result?.questions.filter((q) => !passes(q)) ?? []
  const displayedQuestions = showFailingOnly ? failingQuestions : (result?.questions ?? [])

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Nav */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#E2E8F0]">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link
            href="/admin/audit"
            className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Admin
          </Link>
          <span className="text-[#CBD5E1]">/</span>
          <span className="text-sm font-medium text-[#0F172A]">RAG Evaluation</span>
          <div className="ml-auto flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#6366F1]" />
            <span className="text-xs text-[#64748B] font-medium">Quality Monitoring</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">RAG Evaluation Framework</h1>
          <p className="text-sm text-[#64748B] mt-1">
            150 questions across 10 categories and 6 agents. LLM-judge metrics (Claude Haiku): context quality ≥85%, faithfulness ≥90%, relevance ≥80%.
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6">
          <div className="flex items-end gap-4 flex-wrap">

            {/* Agent filter */}
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">Agent</label>
              <select
                value={agentTarget}
                onChange={(e) => setAgentTarget(e.target.value as AgentAlias | 'all')}
                className="px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-[#6366F1]/30"
                disabled={phase === 'running'}
              >
                <option value="all">All agents</option>
                {(Object.keys(AGENT_LABELS) as AgentAlias[]).map((a) => (
                  <option key={a} value={a}>{AGENT_LABELS[a]}</option>
                ))}
              </select>
            </div>

            {/* Category filter */}
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as QuestionCategory | 'all')}
                className="px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-[#6366F1]/30"
                disabled={phase === 'running'}
              >
                <option value="all">All categories</option>
                {(Object.keys(CATEGORY_LABELS) as QuestionCategory[]).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>

            {/* Max questions */}
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">Max questions</label>
              <select
                value={maxQ}
                onChange={(e) => setMaxQ(Number(e.target.value))}
                className="px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-[#6366F1]/30"
                disabled={phase === 'running'}
              >
                <option value={10}>10 (quick)</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={150}>150 (full)</option>
              </select>
            </div>

            <button
              onClick={runEval}
              disabled={phase === 'running'}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#1E3A8A] text-white text-sm font-medium rounded-lg hover:bg-[#1e40af] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {phase === 'running' ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Running...</>
              ) : (
                <><Play className="w-4 h-4" />Run Evaluation</>
              )}
            </button>
          </div>

          {/* Progress */}
          {phase === 'running' && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-[#94A3B8] mb-1.5">
                <span>{progress.question || 'Initialising...'}</span>
                <span>{progress.done}/{progress.total}</span>
              </div>
              <div className="w-full h-1.5 bg-[#F0F4FF] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#6366F1] rounded-full transition-all duration-300"
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {phase === 'error' && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-100">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-700">{errorMsg}</p>
          </div>
        )}

        {/* Results */}
        {phase === 'done' && result && (
          <>
            {/* Overall */}
            <div className={`bg-white border rounded-2xl p-6 ${result.passed ? 'border-emerald-200' : 'border-red-200'}`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {result.passed
                      ? <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                      : <XCircle className="w-6 h-6 text-red-400" />}
                    <h2 className="text-lg font-bold text-[#0F172A]">
                      {result.passed ? 'All targets met' : 'Below threshold'}
                    </h2>
                  </div>
                  <p className="text-xs text-[#94A3B8]">
                    {result.totalQuestions} questions · {(result.durationMs / 1000).toFixed(1)}s ·
                    Pass rate: {Math.round(result.passRate * 100)}%
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-[#0F172A]">
                    {Math.round(result.contextQuality * 100)}%
                  </div>
                  <div className="text-xs text-[#94A3B8]">avg. context quality</div>
                </div>
              </div>

              <div className="space-y-3">
                <MetricBar label="Context Quality"    value={result.contextQuality}     threshold={T.contextQuality} />
                <MetricBar label="Answer Faithfulness" value={result.answerFaithfulness} threshold={T.answerFaithfulness} />
                <MetricBar label="Answer Relevance"    value={result.answerRelevance}    threshold={T.answerRelevance} />
                {result.contextRecall !== undefined && (
                  <MetricBar label="Context Recall"   value={result.contextRecall}      threshold={T.contextRecall} />
                )}
              </div>
            </div>

            {/* By category */}
            <div>
              <h3 className="text-sm font-semibold text-[#0F172A] mb-3">By Category</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {result.categories.filter((c) => c.count > 0).map((cat) => (
                  <CategoryCard key={cat.category} cat={cat} />
                ))}
              </div>
            </div>

            {/* Question results */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[#0F172A]">
                  Question Results
                  {failingQuestions.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-red-50 text-red-500 text-xs">
                      {failingQuestions.length} failing
                    </span>
                  )}
                </h3>
                <label className="flex items-center gap-2 text-xs text-[#64748B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showFailingOnly}
                    onChange={(e) => setShowFailingOnly(e.target.checked)}
                    className="rounded"
                  />
                  Show failing only
                </label>
              </div>

              <div className="space-y-2">
                {displayedQuestions.map((q) => {
                  const pass = passes(q)
                  const isExpanded = expandedQ === q.id

                  return (
                    <div
                      key={q.id}
                      className={`border rounded-xl overflow-hidden ${pass ? 'border-[#E2E8F0]' : 'border-red-100'}`}
                    >
                      <button
                        onClick={() => setExpandedQ(isExpanded ? null : q.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F8FAFC] transition-colors ${pass ? 'bg-white' : 'bg-red-50/50'}`}
                      >
                        {pass
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium text-[#94A3B8]">[{q.id}]</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-[#F0F4FF] text-[#6366F1] font-medium">{q.agentTarget}</span>
                          </div>
                          <p className="text-sm text-[#334155] truncate">{q.question}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-xs tabular-nums">
                          <span className={q.contextQuality >= T.contextQuality ? 'text-emerald-500' : 'text-red-400'}>
                            CQ {Math.round(q.contextQuality * 100)}%
                          </span>
                          <span className={q.answerFaithfulness >= T.answerFaithfulness ? 'text-emerald-500' : 'text-red-400'}>
                            AF {Math.round(q.answerFaithfulness * 100)}%
                          </span>
                          <span className={q.answerRelevance >= T.answerRelevance ? 'text-emerald-500' : 'text-red-400'}>
                            AR {Math.round(q.answerRelevance * 100)}%
                          </span>
                          {q.contextRecall !== undefined && (
                            <span className={q.contextRecall >= T.contextRecall ? 'text-emerald-500' : 'text-red-400'}>
                              CR {Math.round(q.contextRecall * 100)}%
                            </span>
                          )}
                          <span className="text-[#94A3B8]">{q.latencyMs}ms</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC] space-y-3">
                          {q.error && (
                            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-2">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              {q.error}
                            </div>
                          )}
                          <div>
                            <div className="text-xs font-medium text-[#94A3B8] mb-1">Answer</div>
                            <p className="text-sm text-[#334155] whitespace-pre-wrap">{q.answer || '(empty)'}</p>
                          </div>
                          {q.context && (
                            <div>
                              <div className="text-xs font-medium text-[#94A3B8] mb-1">Retrieved Context (truncated)</div>
                              <p className="text-xs text-[#64748B] whitespace-pre-wrap max-h-32 overflow-y-auto">{q.context}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {displayedQuestions.length === 0 && (
                  <div className="text-center py-8 text-[#94A3B8]">
                    <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">All questions passed!</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
