'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  memo as memoApi, streamMemo, streamMemoSection,
  type MemoResult, type MemoSection, type MemoSSEEvent,
} from '@/lib/api'
import {
  ArrowLeft, RefreshCw, Download, CheckCircle2,
  Loader2, FileText, ChevronRight, RotateCcw, Presentation,
} from 'lucide-react'
import { OutputFeedback } from '@/components/feedback/output-feedback'

// ─── Section definitions (display order) ──────────────────────
const SECTION_META: Record<string, { icon: string; color: string }> = {
  executive_summary:  { icon: '⚡', color: '#a78bfa' },
  company_overview:   { icon: '🏢', color: '#60a5fa' },
  market_analysis:    { icon: '📊', color: '#34d399' },
  financial_analysis: { icon: '💰', color: '#fbbf24' },
  investment_thesis:  { icon: '🎯', color: '#f472b6' },
  key_risks:          { icon: '⚠️', color: '#f87171' },
  management_assessment: { icon: '👥', color: '#fb923c' },
  dd_findings:        { icon: '🔍', color: '#94a3b8' },
  recommendation:     { icon: '✅', color: '#34d399' },
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${value}%`, background: color }}
      />
    </div>
  )
}

const UI_FONT = "var(--font-inter), ui-sans-serif, system-ui, sans-serif"
const MONO_FONT = "var(--font-jetbrains), ui-monospace, monospace"

function SectionContent({ content }: { content: string }) {
  return (
    <div style={{ fontFamily: UI_FONT }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => <h2 style={{ fontFamily: UI_FONT, fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginTop: 16, marginBottom: 6 }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ fontFamily: UI_FONT, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', marginTop: 10, marginBottom: 4 }}>{children}</h3>,
          p: ({ children }) => {
            const text = String(children)
            if (text.trim().startsWith('[DATA NEEDED:')) {
              return (
                <p style={{ fontFamily: MONO_FONT, fontSize: 12, color: 'var(--warn)', background: 'var(--warn-soft)', border: '1px solid var(--warn-b)', borderRadius: 6, padding: '6px 10px', margin: '4px 0' }}>
                  {children}
                </p>
              )
            }
            return <p style={{ fontFamily: UI_FONT, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.7, margin: '4px 0' }}>{children}</p>
          },
          ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: '6px 0' }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: '6px 0' }}>{children}</ol>,
          li: ({ children }) => <li style={{ fontFamily: UI_FONT, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 2 }}>{children}</li>,
          strong: ({ children }) => <strong style={{ fontFamily: UI_FONT, fontWeight: 600, color: 'var(--ink)' }}>{children}</strong>,
          blockquote: ({ children }) => <blockquote style={{ fontFamily: UI_FONT, borderLeft: '3px solid var(--warn-b)', paddingLeft: 12, margin: '8px 0', color: 'var(--ink-2)', fontStyle: 'italic' }}>{children}</blockquote>,
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '12px 0' }}>
              <table style={{ fontFamily: UI_FONT, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead style={{ background: 'var(--surface-2, #f8fafc)' }}>{children}</thead>,
          th: ({ children }) => <th style={{ fontFamily: UI_FONT, padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--ink)', borderBottom: '2px solid var(--border)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{children}</th>,
          td: ({ children }) => <td style={{ fontFamily: UI_FONT, padding: '6px 12px', color: 'var(--ink-2)', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>{children}</td>,
          code: ({ children }) => <code style={{ fontFamily: MONO_FONT, fontSize: 12, background: 'var(--surface-2, #f1f5f9)', padding: '1px 4px', borderRadius: 3 }}>{children}</code>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────

type GenState = 'idle' | 'generating' | 'done' | 'error'

export default function MemoPage() {
  const { id: dealId } = useParams<{ id: string }>()
  const [memo, setMemo] = useState<MemoResult | null>(null)
  const [genState, setGenState] = useState<GenState>('idle')
  const [progress, setProgress] = useState(0)
  const [currentSection, setCurrentSection] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [regenSection, setRegenSection] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Try loading cached memo on mount
  const { data: cached } = useQuery({
    queryKey: ['memo', dealId],
    queryFn: () => memoApi.getLatest(dealId),
    retry: false,
  })

  useEffect(() => {
    if (cached?.memo && genState === 'idle') {
      setMemo(cached.memo)
      setGenState('done')
      if (cached.memo.sections[0]) setActiveSection(cached.memo.sections[0].id)
    }
  }, [cached, genState])

  const handleEvent = useCallback((event: MemoSSEEvent) => {
    if (event.type === 'section_start') {
      setProgress(event.progress)
      setCurrentSection(event.sectionTitle ?? '')
    } else if (event.type === 'section_done') {
      setProgress(event.progress)
    } else if (event.type === 'done') {
      setMemo(event.result)
      setGenState('done')
      setProgress(100)
      setCurrentSection('')
      if (event.result.sections[0]) setActiveSection(event.result.sections[0].id)
    } else if (event.type === 'error') {
      setError(event.message)
      setGenState('error')
    }
  }, [])

  const startGeneration = useCallback(() => {
    setGenState('generating')
    setProgress(0)
    setError(null)
    setMemo(null)
    abortRef.current = streamMemo(dealId, handleEvent)
  }, [dealId, handleEvent])

  const regenerateSection = useCallback((sectionId: string) => {
    setRegenSection(sectionId)
    abortRef.current = streamMemoSection(dealId, sectionId, (event) => {
      if (event.type === 'done') {
        setMemo(event.result)
        setRegenSection(null)
      } else if (event.type === 'error') {
        setRegenSection(null)
      }
    })
  }, [dealId])

  const exportMarkdown = useCallback(() => {
    if (!memo) return
    const md = memo.sections
      .map((s) => `# ${s.title}\n\n${s.content}`)
      .join('\n\n---\n\n')
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${memo.companyName.replace(/\s+/g, '-')}-IC-Memo-v${memo.version}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [memo])

  const exportPdf = useCallback(() => { window.print() }, [])

  const [exportingPptx, setExportingPptx] = useState(false)
  const exportPptx = useCallback(async () => {
    if (!memo || exportingPptx) return
    setExportingPptx(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/deals/${dealId}/memo/export/pptx`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `IC-Memo-${memo.companyName.replace(/\s+/g, '-')}.pptx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silently fall back — user can retry
    } finally {
      setExportingPptx(false)
    }
  }, [memo, dealId, exportingPptx])

  const activeContent = memo?.sections.find((s) => s.id === activeSection)

  // ─── Progress view ──────────────────────────────────────────
  if (genState === 'generating') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ width: 48, height: 48, background: 'var(--accent-soft)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <FileText size={24} style={{ color: 'var(--accent)' }} />
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Generating IC Memo</h1>
            <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Claude Sonnet is writing your memo from deal context</p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 }}>
              <span>{currentSection || 'Preparing...'}</span>
              <span>{progress}%</span>
            </div>
            <ProgressBar value={progress} color="var(--accent)" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {Object.entries(SECTION_META).map(([id, meta]) => {
              const done = memo?.sections.some((s) => s.id === id) ?? false
              const active = !done && currentSection.toLowerCase().includes(id.replace(/_/g, ' ').split(' ')[0] ?? '')
              return (
                <div
                  key={id}
                  style={{
                    padding: 8, borderRadius: 8, border: '1px solid',
                    fontSize: 11, textAlign: 'center', transition: 'all 150ms',
                    borderColor: done ? 'var(--good-b)' : active ? 'var(--accent-soft-b)' : 'var(--line)',
                    background: done ? 'var(--good-soft)' : active ? 'var(--accent-soft)' : 'var(--surface)',
                    color: done ? 'var(--good)' : active ? 'var(--accent)' : 'var(--ink-3)',
                  }}
                >
                  {done ? <CheckCircle2 size={10} style={{ margin: '0 auto 3px' }} /> :
                   active ? <Loader2 size={10} style={{ margin: '0 auto 3px', display: 'block' }} className="animate-spin" /> :
                   <span style={{ fontSize: 10 }}>{meta.icon}</span>}
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{id.replace(/_/g, ' ')}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ─── Empty / error state ────────────────────────────────────
  if (genState === 'idle' || genState === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <Link href={`/deals/${dealId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)', marginBottom: 24, textDecoration: 'none' }}>
            <ArrowLeft size={12} /> Back to deal
          </Link>
          <div style={{ width: 64, height: 64, background: 'var(--accent-soft)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <FileText size={32} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>IC Memo Generator</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 24, lineHeight: 1.6 }}>
            Claude Sonnet will write a PE-standard IC memo from all deal documents and CIM analysis.
          </p>
          {error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--bad-soft)', border: '1px solid var(--bad-b)', borderRadius: 8 }}>
              <p style={{ fontSize: 13, color: 'var(--bad)', margin: 0 }}>{error}</p>
            </div>
          )}
          <button
            onClick={startGeneration}
            className="ax-btn is-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '12px 24px', fontSize: 14 }}
          >
            <FileText size={16} />
            Generate IC Memo
          </button>
        </div>
      </div>
    )
  }

  // ─── Result view ────────────────────────────────────────────
  return (
    <div className="min-h-screen print:bg-white" style={{ background: 'var(--bg)' }}>
      {/* Header — hidden on print */}
      <div
        className="print:hidden px-6 py-4 flex items-center justify-between sticky top-0 backdrop-blur-sm z-10"
        style={{ borderBottom: '1px solid var(--line)', background: 'var(--surface)' }}
      >
        <div className="flex items-center gap-3">
          <Link
            href={`/deals/${dealId}`}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--ink-3)' }}
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 style={{ fontFamily: UI_FONT, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{memo?.companyName} — IC Memo</h1>
            <p style={{ fontFamily: UI_FONT, fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>
              v{memo?.version} · {memo ? new Date(memo.generatedAt).toLocaleDateString() : ''}
              {' · '}{memo?.sections.length ?? 0} sections
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={startGeneration} className="ax-btn">
            <RefreshCw size={12} /> Regenerate All
          </button>
          <button onClick={exportMarkdown} className="ax-btn">
            <Download size={12} /> Markdown
          </button>
          <button onClick={exportPdf} className="ax-btn is-primary">
            <Download size={12} /> Export PDF
          </button>
          <button
            onClick={exportPptx}
            disabled={exportingPptx}
            className="ax-btn"
            style={{ background: 'var(--warn)', color: '#fff', opacity: exportingPptx ? 0.5 : 1 }}
          >
            {exportingPptx ? <Loader2 size={12} className="animate-spin" /> : <Presentation size={12} />}
            {exportingPptx ? 'Generating...' : 'Pitch Deck'}
          </button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block p-8 pb-4 border-b border-gray-200">
        <h1 style={{ fontFamily: UI_FONT, fontSize: 22, fontWeight: 700, color: '#111827' }}>{memo?.companyName}</h1>
        <p style={{ fontFamily: UI_FONT, fontSize: 13, color: '#6b7280', marginTop: 4 }}>Investment Committee Memorandum · {memo ? new Date(memo.generatedAt).toLocaleDateString() : ''}</p>
      </div>

      <div className="flex h-[calc(100vh-57px)] print:block">
        {/* Section navigator — hidden on print */}
        <aside
          className="print:hidden w-56 shrink-0 overflow-y-auto p-3 space-y-1"
          style={{ borderRight: '1px solid var(--line)' }}
        >
          {memo?.sections.map((section) => {
            const meta = SECTION_META[section.id]
            const isActive = activeSection === section.id
            const isRegening = regenSection === section.id
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className="w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-2"
                style={isActive ? {
                  background: 'var(--accent-soft)',
                  color: 'var(--ink)',
                  border: '1px solid var(--accent-soft-b)',
                } : {
                  color: 'var(--ink-3)',
                  border: '1px solid transparent',
                }}
              >
                <span className="text-sm shrink-0">{meta?.icon ?? '📄'}</span>
                <span className="truncate flex-1">{section.title}</span>
                {isRegening ? (
                  <Loader2 size={10} className="shrink-0 animate-spin" style={{ color: 'var(--accent)' }} />
                ) : (
                  <ChevronRight size={10} className="shrink-0" style={{ opacity: isActive ? 1 : 0.3 }} />
                )}
              </button>
            )
          })}
        </aside>

        {/* Section content */}
        <main className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible">
          {/* TODO: display consistency banner above Section 1 */}
          {activeContent ? (
            /* screen-only single-section view */
            <div className="print:hidden max-w-3xl mx-auto">
              {/* Section header */}
              <div className="print:hidden flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{SECTION_META[activeContent.id]?.icon}</span>
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>{activeContent.title}</h2>
                    <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                      Generated {new Date(activeContent.generatedAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => regenerateSection(activeContent.id)}
                  disabled={regenSection === activeContent.id}
                  className="ax-btn"
                  style={{ opacity: regenSection === activeContent.id ? 0.4 : 1 }}
                >
                  {regenSection === activeContent.id ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <RotateCcw size={11} />
                  )}
                  Regenerate
                </button>
              </div>

              {/* Content */}
              <div
                className="rounded-xl p-6 print:bg-white print:border-gray-200 print:rounded-none print:p-0 print:mb-8"
                style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
              >
                {regenSection === activeContent.id ? (
                  <div className="flex items-center gap-3 py-8 justify-center" style={{ color: 'var(--ink-3)' }}>
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-sm">Regenerating {activeContent.title}...</span>
                  </div>
                ) : (
                  <SectionContent content={activeContent.content} />
                )}
              </div>

              {/* Feedback widget — hidden on print */}
              {regenSection !== activeContent.id && (
                <div className="print:hidden mt-3">
                  <OutputFeedback
                    agentKey="AGENT_DUE_DILIGENCE"
                    outputType="ic_memo"
                    outputRef={activeContent.id}
                    dealId={dealId}
                    originalText={activeContent.content}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--ink-3)' }}>
              Select a section from the navigator
            </div>
          )}

          {/* Print: all sections rendered via react-markdown */}
          <div className="hidden print:block space-y-12 p-8">
            {memo?.sections.map((section) => (
              <div key={section.id} style={{ pageBreakInside: 'avoid', breakInside: 'avoid', marginBottom: 48 }}>
                <h2 style={{ fontFamily: UI_FONT, fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #e5e7eb' }}>{section.title}</h2>
                <SectionContent content={section.content} />
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          nav, aside, header { display: none !important; }
          body { background: white; color: black; }
        }
      `}</style>
    </div>
  )
}
