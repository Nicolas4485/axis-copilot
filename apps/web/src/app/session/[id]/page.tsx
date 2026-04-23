'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { sessions, streamMessage as streamAriaMessage, type SSEEvent, type Message, type ConflictRecord } from '@/lib/api'
import { ConflictBanner } from '@/components/conflict-banner'
import { VoiceInput } from '@/components/voice-input'
import { AriaLivePanel } from '@/components/aria/aria-live-panel'
import { MarkdownMessage } from '@/components/markdown-message'
import {
  Send, Upload, ChevronDown, ChevronRight, DollarSign,
  Wrench, FileText, AlertTriangle, Image as ImageIcon, X,
  Mic, MessageSquare, CheckCircle2, Search, Zap, Users,
  GitBranch, Globe, Database, Bot, Loader2,
} from 'lucide-react'

/** Creates a session then hands the new ID back — shown while live mode initialises */
function LiveSessionCreator({ onSessionCreated, onError }: {
  onSessionCreated: (id: string) => void
  onError: () => void
}) {
  const createdRef = useRef(false)

  useEffect(() => {
    if (createdRef.current) return
    createdRef.current = true

    sessions.create({ title: 'Aria Live Session' })
      .then((s) => onSessionCreated(s.id))
      .catch(() => onError())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
        <div className="w-4 h-4 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
        <span className="font-mono">Connecting to Aria…</span>
      </div>
    </div>
  )
}

export default function SessionPage() {
  const { id: paramId }   = useParams<{ id: string }>()
  const router            = useRouter()
  const searchParams      = useSearchParams()
  const [sessionId, setSessionId]         = useState(paramId === 'new' ? null : paramId)
  const [input, setInput]                 = useState('')
  const [mode, setMode]                   = useState<string>('intake')
  const [streaming, setStreaming]         = useState(false)
  const [streamContent, setStreamContent] = useState('')
  type ActivityItem =
    | { id: number; kind: 'tool';     tool: string; label: string; status: 'running' | 'completed' | 'error'; durationMs?: number }
    | { id: number; kind: 'model';    label: string; model: string }
    | { id: number; kind: 'rag';      label: string; status: 'running' | 'done'; resultCount?: number; models: string[] }
    | { id: number; kind: 'delegate'; label: string; workerName: string; query: string }
  const activityIdRef = useRef(0)
  const [activities, setActivities]       = useState<ActivityItem[]>([])
  const [pendingWorkers, setPendingWorkers] = useState<string[]>([])
  const [sources, setSources]             = useState<Array<{ sourceTitle: string; content: string; relevanceScore: number }>>([])
  const [conflicts, setConflicts]         = useState<ConflictRecord[]>([])
  const [showSources, setShowSources]     = useState(false)
  const [imageBase64, setImageBase64]     = useState<string | null>(null)
  const [imagePreview, setImagePreview]   = useState<string | null>(null)
  const liveMode = searchParams.get('live') === 'true'
  const autoMic  = searchParams.get('automic') === 'true'

  const setLiveMode = useCallback((on: boolean) => {
    const base = sessionId ? `/session/${sessionId}` : `/session/new`
    if (on) router.replace(`${base}?live=true`)
    else    router.replace(base)
  }, [sessionId, router])

  const promptParam = searchParams.get('prompt')
  useEffect(() => {
    if (promptParam) setInput(promptParam)
  }, [promptParam]) // eslint-disable-line react-hooks/exhaustive-deps

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const abortRef       = useRef<AbortController | null>(null)

  const { data: session, isLoading: sessionLoading, refetch } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessions.get(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 5000,
  })

  const { data: costData } = useQuery({
    queryKey: ['session-cost', sessionId],
    queryFn: () => sessions.getCost(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 10_000,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.messages, streamContent])

  // Map delegation tool names → display names used in specialist metadata
  const DELEGATE_TOOL_TO_AGENT: Record<string, string> = {
    'delegate_competitive_analysis': 'mel',
    'delegate_product_analysis': 'sean',
    'delegate_stakeholder_analysis': 'anjie',
    'delegate_process_analysis': 'kevin',
  }
  const AGENT_DISPLAY_NAME: Record<string, string> = {
    mel: 'Mel', sean: 'Sean', anjie: 'Anjie', kevin: 'Kevin',
  }

  // On mount / after navigation: restore pending workers by diffing
  // what was delegated (from the last Aria message's toolsUsed) vs what has arrived
  // as specialist messages. This survives page navigation.
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current || !session?.messages || streaming) return
    restoredRef.current = true

    const msgs = session.messages as Array<{ role: string; metadata: unknown }>
    const lastAriaMsg = [...msgs].reverse().find((m) => {
      if (m.role !== 'ASSISTANT') return false
      const meta = m.metadata as Record<string, unknown> | null
      return meta && !meta['agentType'] // not a specialist result itself
    })

    const toolsUsed = (lastAriaMsg?.metadata as Record<string, unknown> | null)?.['toolsUsed'] as string[] | undefined
    if (!toolsUsed) return

    const delegated = toolsUsed
      .filter((t) => t in DELEGATE_TOOL_TO_AGENT)
      .map((t) => DELEGATE_TOOL_TO_AGENT[t]!)

    if (delegated.length === 0) return

    const arrivedAgents = msgs
      .filter((m) => {
        const meta = m.metadata as Record<string, unknown> | null
        return meta?.['agentType'] === 'specialist' && typeof meta?.['agent'] === 'string'
      })
      .map((m) => ((m.metadata as Record<string, unknown>)['agent'] as string).toLowerCase())

    const stillPending = delegated.filter((a) => !arrivedAgents.includes(a))
    if (stillPending.length > 0) {
      setPendingWorkers(stillPending.map((a) => AGENT_DISPLAY_NAME[a] ?? a))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.messages])

  // Clear pending workers when their specialist message lands in the session
  useEffect(() => {
    if (!session?.messages || pendingWorkers.length === 0) return
    const arrivedAgents = session.messages
      .filter((m) => {
        const meta = m.metadata as Record<string, unknown> | null
        return meta?.['agentType'] === 'specialist' && typeof meta?.['agent'] === 'string'
      })
      .map((m) => ((m.metadata as Record<string, unknown>)['agent'] as string).toLowerCase())
    if (arrivedAgents.length > 0) {
      setPendingWorkers(prev => prev.filter(w => !arrivedAgents.includes(w.toLowerCase())))
    }
  }, [session?.messages]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming) return

    setStreaming(true)
    setStreamContent('')
    setActivities([])
    setPendingWorkers([])
    setSources([])
    setConflicts([])

    let activeSessionId = sessionId
    if (!activeSessionId) {
      try {
        const newSession = await sessions.create({ mode, title: input.trim().slice(0, 60) })
        activeSessionId = newSession.id
        setSessionId(activeSessionId)
        router.replace(`/session/${activeSessionId}`)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create session'
        setStreaming(false)
        alert(errorMsg)
        return
      }
    }

    const controller = streamAriaMessage(
      activeSessionId,
      input.trim(),
      { ...(imageBase64 ? { imageBase64 } : {}) },
      (event: SSEEvent) => {
        switch (event.type) {
          case 'rag_search':
            setActivities(prev => [...prev, {
              id: ++activityIdRef.current, kind: 'rag' as const,
              label: event['label'] as string,
              status: 'running' as const,
              models: event['models'] as string[] ?? [],
            }])
            break
          case 'rag_done':
            setActivities(prev => prev.map(a =>
              a.kind === 'rag' && a.status === 'running'
                ? { ...a, status: 'done' as const, resultCount: event['resultCount'] as number }
                : a
            ))
            break
          case 'model_call':
            setActivities(prev => [...prev, {
              id: ++activityIdRef.current, kind: 'model' as const,
              label: event['label'] as string,
              model: event['model'] as string,
            }])
            break
          case 'tool_start':
            setActivities(prev => [...prev, {
              id: ++activityIdRef.current, kind: 'tool' as const,
              tool: event['tool'] as string,
              label: event['label'] as string,
              status: 'running' as const,
            }])
            break
          case 'tool_result': {
            const toolName = event['tool'] as string
            const success  = event['success'] as boolean
            const dur      = event['durationMs'] as number
            setActivities(prev => {
              const idx = [...prev].reverse().findIndex(a =>
                a.kind === 'tool' && a.tool === toolName && a.status === 'running'
              )
              if (idx === -1) return prev
              const realIdx = prev.length - 1 - idx
              return prev.map((a, i): ActivityItem => {
                if (i !== realIdx || a.kind !== 'tool') return a
                return { ...a, status: success ? 'completed' : 'error', durationMs: dur }
              })
            })
            break
          }
          case 'delegation': {
            const wName = event['workerName'] as string | undefined
            if (!wName) break
            setActivities(prev => [...prev, {
              id: ++activityIdRef.current, kind: 'delegate' as const,
              label: event['label'] as string ?? `Delegating to ${wName}`,
              workerName: wName,
              query: (event['query'] as string ?? '').slice(0, 80),
            }])
            setPendingWorkers(prev => prev.includes(wName) ? prev : [...prev, wName])
            break
          }
          case 'token':
            setStreamContent((prev) => prev + (event['content'] as string ?? ''))
            break
          case 'conflict_warning':
            setConflicts((prev) => [...prev, event['conflict'] as ConflictRecord])
            break
          case 'sources':
            setSources(event['citations'] as Array<{ sourceTitle: string; content: string; relevanceScore: number }> ?? [])
            break
          case 'done':
            setImageBase64(null)
            setImagePreview(null)
            refetch().then(() => {
              setStreaming(false)
              setStreamContent('')
            }).catch(() => {
              setStreaming(false)
              setStreamContent('')
            })
            break

        }
      }
    )

    abortRef.current = controller
    setInput('')
  }, [input, streaming, sessionId, mode, imageBase64, refetch, router])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const MAX_SIZE_MB = 5
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`Image must be under ${MAX_SIZE_MB}MB`)
      return
    }

    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1] ?? ''
        setImageBase64(base64)
        setImagePreview(result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const allMessages: Array<Message | { id: string; role: 'ASSISTANT'; content: string; streaming: true }> = [
    ...(session?.messages ?? []),
    ...(streamContent && streaming ? [{
      id: 'streaming',
      role: 'ASSISTANT' as const,
      content: streamContent,
      streaming: true as const,
    }] : []),
  ]

  // Dedup specialist cards: if the same agent produced two results (e.g. double-delegation),
  // keep only the most recent one — scan in reverse, first seen wins.
  const seenSpecialistAgents = new Set<string>()
  const dedupedMessages = [...allMessages].reverse().filter((msg) => {
    const meta = 'metadata' in msg ? (msg.metadata as Record<string, unknown> | null) : null
    if (meta?.['agentType'] !== 'specialist') return true
    const agent = (meta?.['agent'] as string | undefined)?.toLowerCase()
    if (!agent) return true
    if (seenSpecialistAgents.has(agent)) return false
    seenSpecialistAgents.add(agent)
    return true
  }).reverse()

  return (
    <div className="flex flex-col h-screen">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {sessionLoading && !session ? (
            <div className="skeleton h-4 w-40 rounded" />
          ) : (
            <>
              <h2 className="font-serif text-base text-[var(--text-primary)] truncate">
                {session?.title ?? 'New Session'}
              </h2>
              {session?.client && (
                <span className="badge badge-gold shrink-0">{session.client.name}</span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Mode toggle */}
          <div className="flex gap-0.5 bg-[var(--bg-tertiary)] rounded-lg p-0.5 border border-[var(--border)]">
            {[
              { key: 'text', label: 'Text', icon: MessageSquare },
              { key: 'live', label: 'Live', icon: Mic           },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setLiveMode(key === 'live')}
                className={`px-3 py-1 text-xs rounded-md transition-all duration-200 flex items-center gap-1.5 ${
                  (key === 'live' ? liveMode : !liveMode)
                    ? 'bg-[var(--gold)] text-[var(--bg-primary)] font-medium'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Cost badge */}
          {costData && (
            <div
              className="flex items-center gap-1 text-[11px] font-mono text-[var(--text-muted)] px-2 py-1
                         rounded-full bg-[var(--bg-tertiary)] border border-[var(--border)]"
              title="Session cost"
            >
              <DollarSign size={10} />
              <span>${costData.totalCostUsd.toFixed(4)}</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Live mode ──────────────────────────────────────────────────── */}
      {liveMode && sessionId  && <AriaLivePanel sessionId={sessionId} autoConnect={autoMic} autoMic={autoMic} />}
      {liveMode && !sessionId && (
        <LiveSessionCreator
          onSessionCreated={(id) => {
            setSessionId(id)
            window.history.replaceState(null, '', `/session/${id}?live=true${autoMic ? '&automic=true' : ''}`)
          }}
          onError={() => setLiveMode(false)}
        />
      )}

      {/* ── Text mode ──────────────────────────────────────────────────── */}
      {!liveMode && (
        <>
          <ConflictBanner clientId={session?.client?.id ?? null} />

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 bg-[var(--chat-bg)]">

            {/* Empty state */}
            {allMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4 animate-fade-up">
                <div className="w-14 h-14 rounded-2xl bg-[var(--gold)]/[0.08] border border-[var(--gold)]/20
                                flex items-center justify-center">
                  <MessageSquare size={24} className="text-[var(--gold)]" />
                </div>
                <div>
                  <h2 className="font-serif text-xl text-[var(--text-primary)] mb-1">Talk to Aria</h2>
                  <p className="text-sm text-[var(--text-muted)] max-w-sm leading-relaxed">
                    Describe your client, share a document, or ask a question. Aria brainstorms
                    with you and delegates to specialist agents when needed.
                  </p>
                </div>
              </div>
            )}

            {/* Message list */}
            {dedupedMessages.map((msg) => {
              const agentName = 'metadata' in msg
                ? (msg.metadata as Record<string, unknown>)?.['agent'] as string | undefined
                : undefined
              const isSpecialist = !!agentName
              const isUser       = msg.role === 'USER'

              return (
                <div key={msg.id}
                     className={`flex items-end gap-2.5 ${isUser ? 'justify-end' : 'justify-start'} animate-fade-up`}
                     style={{ animationDuration: '0.2s' }}>

                  {/* Aria / specialist avatar — left */}
                  {!isUser && (
                    <div className={`w-7 h-7 rounded-full shrink-0 mb-0.5 flex items-center justify-center text-[11px] font-semibold ${
                      isSpecialist
                        ? 'bg-[var(--gold)]/10 border border-[var(--gold)]/40 text-[var(--gold-dim)]'
                        : 'bg-[#D4EDE3] border border-[rgba(34,160,100,0.30)] text-[#22A064] shadow-sm'
                    }`}>
                      {isSpecialist ? agentName.charAt(0).toUpperCase() : 'A'}
                    </div>
                  )}

                  <div className={`rounded-2xl overflow-hidden shadow-sm ${
                    isUser
                      ? 'max-w-[68%] px-4 py-3 border'
                      : isSpecialist
                        ? 'w-full max-w-2xl border'
                        : 'max-w-[82%] px-4 py-3 border'
                  } ${
                    isUser
                      ? 'bg-[var(--bubble-user-bg)] border-[var(--bubble-user-border)] text-[var(--bubble-user-text)]'
                      : isSpecialist
                        ? 'bg-white text-[var(--chat-text)]'
                        : 'bg-[var(--bubble-aria-bg)] border-[var(--bubble-aria-border)] text-[var(--bubble-aria-text)]'
                  }`}>

                    {/* Aria label */}
                    {!isUser && !isSpecialist && (
                      <p className="text-[10px] font-mono tracking-widest uppercase mb-2 text-[#22A064]/60">Aria</p>
                    )}

                    {/* Specialist header */}
                    {isSpecialist && (
                      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[rgba(0,0,0,0.06)]
                                      bg-[var(--gold)]/[0.04]">
                        <span className="text-xs font-semibold text-[var(--gold-dim)] tracking-wide">
                          {agentName.charAt(0).toUpperCase() + agentName.slice(1)}
                        </span>
                        <span className="text-[10px] text-[var(--chat-text-muted)] font-mono">· specialist</span>
                        {(() => {
                          const meta = 'metadata' in msg ? (msg.metadata as Record<string, unknown> | null) : null
                          const tools = meta?.['toolsUsed'] as string[] | undefined
                          if (!tools?.length) return null
                          const hasPerplexity = tools.includes('perplexity_search')
                          return (
                            <span className="ml-auto flex items-center gap-1 text-[9px] font-mono text-[var(--text-muted)]">
                              {hasPerplexity && (
                                <span className="flex items-center gap-0.5" style={{ color: '#818CF8' }}>
                                  <Zap size={9} /> perplexity
                                </span>
                              )}
                              <span>{tools.length} tool{tools.length !== 1 ? 's' : ''}</span>
                            </span>
                          )
                        })()}
                      </div>
                    )}

                    {/* Partial result warning banner */}
                    {isSpecialist && (() => {
                      const meta = 'metadata' in msg ? (msg.metadata as Record<string, unknown> | null) : null
                      if (meta?.['isPartial'] !== true) return null
                      return (
                        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100">
                          <AlertTriangle size={11} className="text-amber-500 shrink-0" />
                          <span className="text-[11px] text-amber-700">Partial result — analysis timed out before completing</span>
                          <button
                            onClick={() => setInput(`@${agentName ?? ''} `)}
                            className="ml-auto text-[11px] text-amber-600 hover:text-amber-800 font-medium whitespace-nowrap"
                          >
                            Retry →
                          </button>
                        </div>
                      )
                    })()}

                    <div className={isSpecialist ? 'px-4 py-3' : ''}>
                      <MarkdownMessage
                        content={(() => {
                          const meta = 'metadata' in msg ? (msg.metadata as Record<string, unknown> | null) : null
                          const c = msg.content
                          if (meta?.['isPartial'] === true) {
                            return c.replace(/^\[PARTIAL RESULT[^\]]*\]\n\n/, '')
                          }
                          return c
                        })()}
                        streaming={'streaming' in msg && msg.streaming}
                      />
                    </div>
                  </div>

                  {/* User avatar — right */}
                  {isUser && (
                    <div className="w-7 h-7 rounded-full shrink-0 mb-0.5 flex items-center justify-center
                                    text-[11px] font-semibold bg-[var(--bubble-user-bg)]
                                    border border-[var(--bubble-user-border)] text-[var(--gold-dim)] shadow-sm">
                      Y
                    </div>
                  )}
                </div>
              )
            })}
            {/* Pending specialist cards — shown while background agents are running */}
            {pendingWorkers.map((workerName) => (
              <div key={workerName} className="flex items-end gap-2.5 justify-start animate-fade-up" style={{ animationDuration: '0.2s' }}>
                <div className="w-7 h-7 rounded-full shrink-0 mb-0.5 flex items-center justify-center text-[11px] font-semibold bg-[var(--gold)]/10 border border-[var(--gold)]/40 text-[var(--gold-dim)]">
                  {workerName.charAt(0).toUpperCase()}
                </div>
                <div className="rounded-2xl overflow-hidden shadow-sm border border-[var(--gold)]/20 bg-white px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-[var(--gold-dim)] tracking-wide">{workerName}</span>
                    <span className="text-[10px] text-[var(--chat-text-muted)] font-mono">· specialist</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <Loader2 size={13} className="animate-spin text-[var(--gold)]" />
                    <span>Researching and building analysis… this takes 1–2 minutes</span>
                  </div>
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Activity timeline */}
          {activities.length > 0 && (
            <div className="px-5 pt-2.5 pb-2 border-t border-[var(--border)] bg-[var(--bg-secondary)]">
              <p className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)] mb-2">Activity</p>
              <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                {activities.map((item) => {
                  const fmtMs = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`

                  // Icon + color by kind/tool
                  let Icon: React.ElementType = Wrench
                  let iconColor = 'text-[var(--text-muted)]'
                  if (item.kind === 'model') { Icon = Zap; iconColor = 'text-[#60A5FA]' }
                  else if (item.kind === 'rag') { Icon = Database; iconColor = 'text-[var(--gold)]' }
                  else if (item.kind === 'delegate') { Icon = Users; iconColor = 'text-[#A78BFA]' }
                  else if (item.kind === 'tool') {
                    const t = item.tool
                    if (t === 'perplexity_search') { Icon = Zap; iconColor = 'text-[#818CF8]' }
                    else if (t === 'web_search') { Icon = Globe; iconColor = 'text-[var(--text-secondary)]' }
                    else if (t.includes('search') || t.includes('web')) { Icon = Search; iconColor = 'text-[var(--gold)]' }
                    else if (t.includes('graph')) { Icon = GitBranch; iconColor = 'text-[#34D399]' }
                    else if (t.includes('drive') || t.includes('document')) { Icon = FileText; iconColor = 'text-[var(--text-secondary)]' }
                    else if (t.includes('ingest')) { Icon = Database; iconColor = 'text-[var(--gold)]' }
                    else if (t.includes('email') || t.includes('gmail')) { Icon = Bot; iconColor = 'text-[var(--text-secondary)]' }
                    else if (t === 'run_cim_analysis') { Icon = FileText; iconColor = 'text-[#60A5FA]' }
                    else if (t === 'generate_ic_memo') { Icon = FileText; iconColor = 'text-[#A78BFA]' }
                    else if (t === 'list_deals' || t === 'get_deal_status') { Icon = DollarSign; iconColor = 'text-[var(--gold)]' }
                    else if (t === 'create_deal' || t === 'move_deal_stage') { Icon = DollarSign; iconColor = 'text-[#34D399]' }
                  }

                  return (
                    <div key={item.id} className="flex items-start gap-2">
                      <div className={`mt-0.5 shrink-0 ${iconColor}`}><Icon size={11} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-[var(--text-primary)] leading-tight truncate">
                          {item.label}
                          {item.kind === 'tool' && (
                            <span className="ml-1.5 text-[9px] font-mono text-[var(--text-muted)] opacity-70">
                              {item.tool.replace(/_/g, ' ')}
                            </span>
                          )}
                        </p>
                        {item.kind === 'rag' && item.status === 'running' && (
                          <p className="text-[9px] text-[var(--text-muted)] font-mono mt-0.5">{item.models.join(' → ')}</p>
                        )}
                        {item.kind === 'rag' && item.status === 'done' && (
                          <p className="text-[9px] text-[var(--text-muted)] font-mono mt-0.5">{item.models.join(' → ')} · {item.resultCount} result{item.resultCount !== 1 ? 's' : ''}</p>
                        )}
                        {item.kind === 'model' && (
                          <p className="text-[9px] text-[#60A5FA]/70 font-mono mt-0.5">{item.model}</p>
                        )}
                        {item.kind === 'delegate' && item.query && (
                          <p className="text-[9px] text-[#A78BFA]/70 font-mono mt-0.5 truncate">"{item.query}"</p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-1 mt-0.5">
                        {item.kind === 'tool' && item.status === 'running' && (
                          <div className="w-2.5 h-2.5 border border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
                        )}
                        {item.kind === 'tool' && item.status === 'completed' && (
                          <>
                            <CheckCircle2 size={11} className="text-[var(--success)]" />
                            {item.durationMs !== undefined && (
                              <span className="text-[9px] text-[var(--text-muted)] font-mono">{fmtMs(item.durationMs)}</span>
                            )}
                          </>
                        )}
                        {item.kind === 'tool' && item.status === 'error' && (
                          <X size={11} className="text-[var(--error)]" />
                        )}
                        {item.kind === 'rag' && item.status === 'running' && (
                          <div className="w-2.5 h-2.5 border border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
                        )}
                        {item.kind === 'rag' && item.status === 'done' && (
                          <CheckCircle2 size={11} className="text-[var(--success)]" />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div className="px-5 py-3 bg-[var(--warning)]/[0.04] border-t border-[var(--warning)]/20 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-[var(--warning)] font-mono font-medium">
                <AlertTriangle size={12} />
                {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} detected in this response
              </div>
              {conflicts.map((c, i) => (
                <div key={i} className="text-xs text-[var(--text-muted)] pl-5 font-mono leading-relaxed">
                  · <span className="text-[var(--text-secondary)]">{c.entityName}</span> — {c.property}:{' '}
                  <span className="text-[var(--text-primary)]">&quot;{c.valueA}&quot;</span>
                  {' '}<span className="opacity-60">({c.sourceDocA})</span>
                  {' '}vs{' '}
                  <span className="text-[var(--text-primary)]">&quot;{c.valueB}&quot;</span>
                  {' '}<span className="opacity-60">({c.sourceDocB})</span>
                </div>
              ))}
            </div>
          )}

          {/* Sources panel */}
          {sources.length > 0 && (
            <div className="border-t border-[var(--border)]">
              <button
                onClick={() => setShowSources(!showSources)}
                className="flex items-center gap-2 px-5 py-2 w-full text-xs text-[var(--text-muted)]
                           hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors font-mono"
              >
                {showSources ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <FileText size={12} />
                {sources.length} source{sources.length > 1 ? 's' : ''} used
              </button>
              {showSources && (
                <div className="px-5 pb-3 space-y-2">
                  {sources.map((s, i) => (
                    <div key={i} className="card text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--gold)] font-mono">[{i + 1}] {s.sourceTitle}</span>
                        <span className="badge badge-muted">{Math.round(s.relevanceScore * 100)}%</span>
                      </div>
                      <p className="text-[var(--text-muted)] leading-relaxed line-clamp-3">{s.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Image preview */}
          {imagePreview && (
            <div className="px-5 py-2 border-t border-[var(--border)] bg-[var(--bg-secondary)]">
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Upload preview" className="h-16 rounded-xl border border-[var(--border)]" />
                <button
                  onClick={() => { setImageBase64(null); setImagePreview(null) }}
                  aria-label="Remove image"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--bg-primary)] rounded-full
                             border border-[var(--border)] flex items-center justify-center
                             hover:border-[var(--error)] hover:text-[var(--error)] transition-colors"
                >
                  <X size={10} />
                </button>
              </div>
            </div>
          )}

          {/* Input bar */}
          <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
            <div className="flex items-end gap-2 max-w-3xl mx-auto">
              {/* Upload */}
              <button
                onClick={() => fileInputRef.current?.click()}
                aria-label="Upload image"
                className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]
                           hover:bg-[var(--bg-hover)] rounded-lg transition-colors shrink-0"
              >
                {imageBase64
                  ? <ImageIcon size={16} className="text-[var(--gold)]" />
                  : <Upload size={16} />
                }
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              {/* Voice input */}
              <VoiceInput onTranscript={(text) => setInput(text)} disabled={streaming} />

              {/* Text area */}
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Aria anything…"
                rows={1}
                disabled={streaming}
                className="input flex-1 resize-none min-h-[40px] max-h-32"
              />

              {/* Send */}
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim() || streaming}
                aria-label="Send message"
                className="btn-primary flex items-center gap-1.5 disabled:opacity-30 shrink-0"
              >
                <Send size={13} />
                Send
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
