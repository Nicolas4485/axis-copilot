'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle2, Circle, Loader2, AlertTriangle,
  ChevronDown, ChevronUp, Printer, AlertCircle, HelpCircle,
  TableProperties,
} from 'lucide-react'
import { streamCimAnalysis, cimAnalysis } from '@/lib/api'
import type { CimSSEEvent, CIMAnalysisResult, FitScore, FinancialExtraction } from '@/lib/api'
import { FitScoreRadar } from '@/components/cim/fit-score-radar'
import { OutputFeedback } from '@/components/feedback/output-feedback'

// ─── Step definitions ─────────────────────────────────────────

const PIPELINE_STEPS = [
  { key: 'ingesting',  label: 'Ingesting document',    minProgress: 0  },
  { key: 'extract',    label: 'Extracting structure',  minProgress: 10 },
  { key: 'conflicts',  label: 'Detecting conflicts',   minProgress: 20 },
  { key: 'agents',     label: 'Running due diligence', minProgress: 30 },
  { key: 'scoring',    label: 'Scoring deal fit',      minProgress: 60 },
  { key: 'summary',    label: 'Generating summary',    minProgress: 75 },
  { key: 'done',       label: 'Complete',              minProgress: 95 },
]

// ─── Severity badge ───────────────────────────────────────────

function SeverityBadge({ severity }: { severity: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const styles = {
    HIGH:   'bg-red-500/10 text-red-400 border-red-500/20',
    MEDIUM: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    LOW:    'bg-slate-500/10 text-slate-400 border-slate-500/20',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[severity]}`}>
      {severity}
    </span>
  )
}

// ─── Progress view ────────────────────────────────────────────

function ProgressView({
  currentStep,
  progress,
  message,
}: {
  currentStep: string
  progress: number
  message: string
}) {
  const currentIdx = PIPELINE_STEPS.findIndex((s) => s.key === currentStep)

  return (
    <div className="max-w-xl mx-auto py-16 px-6">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#E2E8F0] text-xs text-[#64748B] font-medium mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#6366F1] inline-block" />
          CIM ANALYSIS
        </div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Analyzing document</h1>
        <p className="text-[#64748B] mt-1 text-sm">{message}</p>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-[#F0F4FF] rounded-full mb-8 overflow-hidden">
        <div
          className="h-full bg-[#1E3A8A] rounded-full transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {PIPELINE_STEPS.filter((s) => s.key !== 'done').map((step, idx) => {
          const status =
            idx < currentIdx ? 'done'
            : idx === currentIdx ? 'active'
            : 'pending'

          return (
            <div
              key={step.key}
              className={`flex items-center gap-3 rounded-xl p-3 transition-all duration-300 ${
                status === 'active' ? 'bg-[#F0F4FF] border border-[#1E3A8A]/20' : ''
              }`}
            >
              {status === 'done' && (
                <CheckCircle2 className="w-5 h-5 text-[#34d399] shrink-0" />
              )}
              {status === 'active' && (
                <Loader2 className="w-5 h-5 text-[#1E3A8A] animate-spin shrink-0" />
              )}
              {status === 'pending' && (
                <Circle className="w-5 h-5 text-[#CBD5E1] shrink-0" />
              )}
              <span
                className={`text-sm font-medium ${
                  status === 'done' ? 'text-[#64748B] line-through' :
                  status === 'active' ? 'text-[#0F172A]' :
                  'text-[#CBD5E1]'
                }`}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Financial table ─────────────────────────────────────────

function FinancialTable({ data }: { data: FinancialExtraction }) {
  const { years, currency, unit, confidence } = data
  if (years.length === 0) return null

  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'
  const u = unit === 'millions' ? 'M' : unit === 'thousands' ? 'K' : ''

  const fmt = (n: number | null) =>
    n != null ? `${sym}${n.toLocaleString()}${u}` : '—'
  const fmtPct = (n: number | null) =>
    n != null ? `${n > 0 ? '+' : ''}${n}%` : '—'

  const confColor =
    confidence === 'high' ? 'text-emerald-500' :
    confidence === 'medium' ? 'text-amber-500' :
    'text-slate-400'

  const rows = [
    { label: 'Revenue',       values: years.map((y) => fmt(y.revenue)) },
    { label: 'Rev Growth',    values: years.map((y) => fmtPct(y.revenueGrowth)) },
    { label: 'Gross Profit',  values: years.map((y) => fmt(y.grossProfit)) },
    { label: 'Gross Margin',  values: years.map((y) => fmtPct(y.grossMargin)) },
    { label: 'EBITDA',        values: years.map((y) => fmt(y.ebitda)) },
    { label: 'EBITDA Margin', values: years.map((y) => fmtPct(y.ebitdaMargin)) },
  ]

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-xs font-medium ${confColor}`}>
          {confidence.toUpperCase()} confidence
        </span>
        <span className="text-xs text-[#94A3B8]">· {currency} {unit} · PDF extraction</span>
      </div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[#E2E8F0]">
            <th className="text-left py-2 pr-4 text-xs text-[#94A3B8] font-medium w-32">Metric</th>
            {years.map((y) => (
              <th key={y.year} className="text-right py-2 px-3 text-xs text-[#94A3B8] font-medium">{y.year}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.filter((r) => r.values.some((v) => v !== '—')).map((row, i) => (
            <tr key={row.label} className={i % 2 === 0 ? 'bg-[#F8FAFC]' : 'bg-white'}>
              <td className="py-2 pr-4 text-xs text-[#64748B] font-medium">{row.label}</td>
              {row.values.map((val, j) => (
                <td key={j} className={`py-2 px-3 text-xs text-right font-mono ${
                  val.startsWith('+') ? 'text-emerald-600' :
                  val.startsWith('-') ? 'text-red-500' :
                  'text-[#0F172A]'
                }`}>{val}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Result view ──────────────────────────────────────────────

function RecommendationBadge({ rec }: { rec: FitScore['recommendation'] }) {
  const styles = {
    STRONG_PROCEED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    PROCEED:        'bg-blue-500/10 text-blue-500 border-blue-500/20',
    PASS:           'bg-red-500/10 text-red-400 border-red-500/20',
  }
  const labels = {
    STRONG_PROCEED: 'Strong Proceed',
    PROCEED: 'Proceed',
    PASS: 'Pass',
  }
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${styles[rec]}`}>
      {labels[rec]}
    </span>
  )
}

function AgentCard({ name, content, dealId }: { name: string; content: string; dealId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[#E2E8F0] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-[#F8FAFC] transition-colors"
      >
        <span className="font-semibold text-[#0F172A] text-sm">{name}</span>
        {open ? <ChevronUp className="w-4 h-4 text-[#64748B]" /> : <ChevronDown className="w-4 h-4 text-[#64748B]" />}
      </button>
      {open && (
        <div className="px-5 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC]">
          <pre className="text-xs text-[#334155] whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto">
            {content}
          </pre>
          <OutputFeedback
            agentKey="AGENT_DUE_DILIGENCE"
            outputType="cim_analysis"
            outputRef="agent_insights"
            dealId={dealId}
            originalText={content}
            compact
          />
        </div>
      )}
    </div>
  )
}

function ResultView({ result, dealId }: { result: CIMAnalysisResult; dealId: string }) {
  const { companySnapshot: snap, fitScore, redFlags, keyQuestions, agentInsights, conflicts, extractedFinancials } = result

  const scoreRows: Array<{ label: string; key: keyof FitScore }> = [
    { label: 'Business Quality',    key: 'businessQuality' },
    { label: 'Financial Quality',   key: 'financialQuality' },
    { label: 'Management Strength', key: 'managementStrength' },
    { label: 'Market Dynamics',     key: 'marketDynamics' },
    { label: 'Deal Structure',      key: 'dealStructure' },
  ]

  return (
    <div className="print-content max-w-4xl mx-auto py-8 px-6 space-y-6 print:px-0 print:py-4">

      {/* Print-only header */}
      <div className="hidden print:flex items-center justify-between mb-6 pb-4 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">{snap.name}</h1>
          <p className="text-sm text-[#64748B] mt-1">Confidential Information Memorandum — CIM Analysis · {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
        <div className="text-right">
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#0F172A] text-white">{fitScore.recommendation?.replace(/_/g, ' ')}</span>
          <p className="text-xs text-[#64748B] mt-1">Overall: {fitScore.overallFit}/100</p>
        </div>
      </div>

      {/* Screen header */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-[#0F172A]">{snap.name}</h1>
            <RecommendationBadge rec={fitScore.recommendation} />
          </div>
          <p className="text-sm text-[#64748B]">
            {snap.hq && `${snap.hq} · `}
            {snap.primaryMarket && `${snap.primaryMarket} · `}
            Completed in {Math.round(result.durationMs / 1000)}s
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
        >
          <Printer className="w-4 h-4" />
          Export PDF
        </button>
      </div>

      {/* 1. Company Snapshot */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1E3A8A]" />
          <span className="text-xs font-semibold tracking-widest text-[#64748B] uppercase">Company Snapshot</span>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
          {[
            { label: 'Revenue',     value: snap.revenue },
            { label: 'EBITDA',      value: snap.ebitda },
            { label: 'Margin',      value: snap.ebitdaMargin },
            { label: 'YoY Growth',  value: snap.revenueGrowthYoY },
            { label: 'Employees',   value: snap.employees },
            { label: 'Founded',     value: snap.founded },
            { label: 'HQ',          value: snap.hq },
            { label: 'Ask Price',   value: snap.askPrice },
            { label: 'EV/EBITDA',   value: snap.proposedEVEBITDA != null ? `${snap.proposedEVEBITDA}×` : null },
            { label: 'Audited',     value: snap.auditedFinancials ? 'Yes' : 'No' },
            { label: 'Business',    value: snap.businessModel },
            { label: 'Market',      value: snap.primaryMarket },
          ].filter((r) => r.value).map((row) => (
            <div key={row.label}>
              <div className="text-xs text-[#94A3B8] font-medium">{row.label}</div>
              <div className="text-sm font-semibold text-[#0F172A] mt-0.5">{row.value}</div>
            </div>
          ))}
        </div>

        {snap.keyCustomers.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#F1F5F9]">
            <div className="text-xs text-[#94A3B8] font-medium mb-1">Key Customers</div>
            <div className="flex flex-wrap gap-1.5">
              {snap.keyCustomers.slice(0, 8).map((c) => (
                <span key={c} className="px-2 py-0.5 bg-[#F0F4FF] text-[#1E3A8A] text-xs rounded-md font-medium">{c}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 2. Extracted Financials — only shown when PDF extraction succeeded */}
      {extractedFinancials && extractedFinancials.years.length > 0 && (
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <TableProperties className="w-4 h-4 text-[#6366F1]" />
            <span className="text-xs font-semibold tracking-widest text-[#64748B] uppercase">Extracted Financials</span>
          </div>
          <FinancialTable data={extractedFinancials} />
        </section>
      )}

      {/* 3. Fit Score */}
      <section className="print-break-before bg-white border border-[#E2E8F0] rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#6366F1]" />
          <span className="text-xs font-semibold tracking-widest text-[#64748B] uppercase">Fit Score</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-8 items-center">
          <FitScoreRadar
            scores={{
              businessQuality:    fitScore.businessQuality,
              financialQuality:   fitScore.financialQuality,
              managementStrength: fitScore.managementStrength,
              marketDynamics:     fitScore.marketDynamics,
              dealStructure:      fitScore.dealStructure,
            }}
            size={260}
          />
          <div className="flex-1 w-full space-y-2.5">
            {scoreRows.map(({ label, key }) => {
              const score = fitScore[key] as number
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-[#334155] font-medium">{label}</span>
                    <span className="text-sm font-bold text-[#0F172A]">{score}/100</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#F0F4FF] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${score}%`,
                        background: score >= 70 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171',
                      }}
                    />
                  </div>
                  {fitScore.rationale[key] && (
                    <p className="text-xs text-[#94A3B8] mt-0.5">{fitScore.rationale[key]}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 4. Red Flags */}
      {(redFlags.length > 0 || conflicts.length > 0) && (
        <section className="print-break-before bg-white border border-[#E2E8F0] rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            <span className="text-xs font-semibold tracking-widest text-[#64748B] uppercase">Red Flags</span>
          </div>
          <div className="space-y-2.5">
            {redFlags.map((flag, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[#FFF8F8] border border-red-100">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SeverityBadge severity={flag.severity} />
                    {flag.pageRef && (
                      <span className="text-xs text-[#94A3B8]">{flag.pageRef}</span>
                    )}
                  </div>
                  <p className="text-sm text-[#334155] mt-1">{flag.description}</p>
                </div>
              </div>
            ))}
            {conflicts.map((c, i) => (
              <div key={`conflict-${i}`} className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <SeverityBadge severity={c.severity} />
                    <span className="text-xs font-medium text-amber-700">Data conflict: {c.entity}.{c.property}</span>
                  </div>
                  <p className="text-xs text-[#64748B]">
                    <span className="font-medium">{c.valueA}</span> ({c.sourceA}) vs{' '}
                    <span className="font-medium">{c.valueB}</span> ({c.sourceB})
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Key Questions */}
      {keyQuestions.length > 0 && (
        <section className="print-break-before bg-white border border-[#E2E8F0] rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24]" />
            <span className="text-xs font-semibold tracking-widest text-[#64748B] uppercase">Key Questions for Management</span>
          </div>
          <ol className="space-y-2">
            {keyQuestions.map((q, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-[#F0F4FF] text-[#1E3A8A] text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <p className="text-sm text-[#334155]">{q}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 6. Agent Insights */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34d399]" />
          <span className="text-xs font-semibold tracking-widest text-[#64748B] uppercase">Agent Insights</span>
        </div>
        <div className="space-y-3">
          <AgentCard name="Alex — Due Diligence" content={agentInsights.alex} dealId={dealId} />
        </div>
      </section>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function CimAnalysisPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const dealId = params['id'] as string
  const documentId = searchParams.get('documentId')
  const autostart = searchParams.get('autostart') === 'true'

  const [phase, setPhase] = useState<'idle' | 'loading' | 'running' | 'done' | 'error'>('idle')
  const [currentStep, setCurrentStep] = useState('ingesting')
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('Starting analysis...')
  const [result, setResult] = useState<CIMAnalysisResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const handleEvent = useCallback((event: CimSSEEvent) => {
    if (event.type === 'step') {
      setCurrentStep(event.step ?? 'ingesting')
      setProgress(event.progress ?? 0)
      setStatusMessage(event.message ?? '')
    } else if (event.type === 'done' && event.result) {
      setResult(event.result)
      setPhase('done')
    } else if (event.type === 'error') {
      setErrorMsg(event.error ?? 'Analysis failed')
      setPhase('error')
    }
  }, [])

  const runAnalysis = useCallback(() => {
    if (!documentId) return
    setPhase('running')
    setProgress(0)
    setCurrentStep('ingesting')
    setStatusMessage('Starting analysis...')

    abortRef.current = streamCimAnalysis(dealId, documentId, handleEvent)
  }, [dealId, documentId, handleEvent])

  // Load cached result or autostart
  useEffect(() => {
    if (phase !== 'idle') return

    setPhase('loading')
    cimAnalysis.getLatest(dealId)
      .then(({ result: cached }) => {
        setResult(cached)
        setPhase('done')
      })
      .catch(() => {
        // No cached result
        if (autostart && documentId) {
          runAnalysis()
        } else {
          setPhase('idle')
        }
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Nav */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#E2E8F0] print:hidden">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link
            href={`/deals/${dealId}`}
            className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to deal
          </Link>
          <span className="text-[#CBD5E1]">/</span>
          <span className="text-sm font-medium text-[#0F172A]">CIM Analysis</span>
        </div>
      </div>

      {/* Content */}
      {(phase === 'idle' || phase === 'loading') && (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 text-[#CBD5E1] animate-spin" />
        </div>
      )}

      {phase === 'running' && (
        <ProgressView currentStep={currentStep} progress={progress} message={statusMessage} />
      )}

      {phase === 'done' && result && (
        <ResultView result={result} dealId={dealId} />
      )}

      {phase === 'error' && (
        <div className="max-w-xl mx-auto py-16 px-6 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-[#0F172A] mb-2">Analysis failed</h2>
          <p className="text-sm text-[#64748B] mb-6">{errorMsg}</p>
          <button
            onClick={runAnalysis}
            className="px-5 py-2.5 bg-[#1E3A8A] text-white text-sm font-medium rounded-lg hover:bg-[#1e40af] transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Start prompt — no documentId, no cached result */}
      {phase === 'idle' && !documentId && (
        <div className="max-w-xl mx-auto py-16 px-6 text-center">
          <HelpCircle className="w-10 h-10 text-[#CBD5E1] mx-auto mb-4" />
          <h2 className="text-lg font-bold text-[#0F172A] mb-2">No document selected</h2>
          <p className="text-sm text-[#64748B] mb-6">
            Go to the Documents tab and click "Run CIM Analysis" on a PDF to start.
          </p>
          <Link
            href={`/deals/${dealId}?tab=documents`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1E3A8A] text-white text-sm font-medium rounded-lg hover:bg-[#1e40af] transition-colors"
          >
            Go to Documents
          </Link>
        </div>
      )}
    </div>
  )
}
