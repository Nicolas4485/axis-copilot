'use client'

// AriaLivePanel — full live-mode UI with transcript, avatar, tools, and text input

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAriaLive } from '@/lib/use-aria-live'
import { AriaAvatar } from './aria-avatar'
import { AriaControls } from './aria-controls'
import { Send, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { MarkdownMessage } from '@/components/markdown-message'

interface AriaLivePanelProps {
  sessionId: string
  autoConnect?: boolean
  autoMic?: boolean
}

interface TranscriptEntry {
  role: 'user' | 'aria'
  text: string
  timestamp: Date
  isPending?: boolean
}

/** Map tool names to friendly agent display names */
const AGENT_NAMES: Record<string, string> = {
  delegate_product_analysis:     'Sean · Product',
  delegate_process_analysis:     'Kevin · Process',
  delegate_competitive_analysis: 'Mel · Competitive',
  delegate_stakeholder_analysis: 'Anjie · Stakeholder',
}

export function AriaLivePanel({ sessionId, autoConnect = false, autoMic = false }: AriaLivePanelProps) {
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([])
  const [interimText, setInterimText] = useState('')
  const [textInput, setTextInput]   = useState('')
  const [errorMsg, setErrorMsg]     = useState<string | null>(null)
  const [liveAvailable, setLiveAvailable] = useState(true)
  const transcriptRef               = useRef<HTMLDivElement>(null)
  const autoConnectDone             = useRef(false)
  const prevStateRef                = useRef<string>('idle')

  // Persist transcript to sessionStorage on every change
  useEffect(() => {
    if (transcriptEntries.length > 0) {
      sessionStorage.setItem(
        `transcript-${sessionId}`,
        JSON.stringify(transcriptEntries.map(e => ({ ...e, timestamp: e.timestamp.toISOString() })))
      )
    }
  }, [transcriptEntries, sessionId])

  const handleTranscript = useCallback((text: string, isFinal: boolean) => {
    if (isFinal) {
      setInterimText('')
      setTranscriptEntries((prev) => {
        // Replace a pending speech placeholder with the actual transcript
        const lastIndex = prev.length - 1
        if (prev[lastIndex]?.isPending) {
          return [
            ...prev.slice(0, lastIndex),
            { role: 'user' as const, text, timestamp: prev[lastIndex]!.timestamp },
          ]
        }
        return [...prev, { role: 'user', text, timestamp: new Date() }]
      })
    } else {
      setInterimText(text)
    }
  }, [])

  const handleAriaResponse = useCallback((text: string) => {
    setTranscriptEntries((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role === 'aria') {
        return [...prev.slice(0, -1), { ...last, text: last.text + text }]
      }
      return [...prev, { role: 'aria', text, timestamp: new Date() }]
    })
  }, [])

  const handleError = useCallback((error: string) => {
    console.error('[AriaLive] Error:', error)
    setErrorMsg(error)
  }, [])

  const ariaLive = useAriaLive({
    sessionId,
    onTranscript: handleTranscript,
    onAriaResponse: handleAriaResponse,
    onError: handleError,
  })

  // When Gemini transitions to 'thinking' from 'listening', the user just finished speaking.
  // Add a pending placeholder immediately — replaced by the real inputTranscription if/when
  // Gemini sends it. If Gemini never sends one, the placeholder shows the user their voice
  // was received.
  useEffect(() => {
    if (ariaLive.state === 'thinking' && prevStateRef.current === 'listening') {
      setTranscriptEntries((prev) => {
        // Don't add a second placeholder if one is already pending
        if (prev[prev.length - 1]?.isPending) return prev
        return [...prev, { role: 'user', text: '🎤 voice message', timestamp: new Date(), isPending: true }]
      })
    }
    prevStateRef.current = ariaLive.state
  }, [ariaLive.state])

  // Pre-flight: check if Gemini Live is configured server-side
  useEffect(() => {
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'
    fetch(`${apiUrl}/api/aria/live-health`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { configured?: boolean }) => {
        if (data.configured === false) setLiveAvailable(false)
      })
      .catch(() => { /* non-critical — assume available if health check fails */ })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-connect on mount (when coming from "Talk to Aria")
  useEffect(() => {
    if (!autoConnect || autoConnectDone.current) return
    autoConnectDone.current = true

    const timer = setTimeout(async () => {
      try {
        await ariaLive.connect()
        if (autoMic) setTimeout(() => ariaLive.toggleMic(), 500)
      } catch {
        // User can retry manually — error surfaces via onError callback
      }
    }, 300)

    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load previous session messages on mount.
  // Restore from sessionStorage first (instant), then DB (canonical, may have more entries).
  useEffect(() => {
    const saved = sessionStorage.getItem(`transcript-${sessionId}`)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Array<{ role: 'user' | 'aria'; text: string; timestamp: string; isPending?: boolean }>
        const entries = parsed.map(e => ({ ...e, timestamp: new Date(e.timestamp), isPending: false }))
        if (entries.length > 0) setTranscriptEntries(entries)
      } catch { /* ignore malformed data */ }
    }

    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'
    fetch(`${apiUrl}/api/sessions/${sessionId}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data: { messages?: Array<{ role: string; content: string; createdAt: string }> }) => {
        if (data.messages && data.messages.length > 0) {
          const history: TranscriptEntry[] = data.messages
            .filter((m) => m.content.trim().length > 0)
            .map((m) => ({
              role:      m.role === 'USER' ? 'user' as const : 'aria' as const,
              text:      m.content,
              timestamp: new Date(m.createdAt),
            }))
          // Only overwrite if DB has more entries than what we loaded from sessionStorage
          setTranscriptEntries(prev => history.length >= prev.length ? history : prev)
        }
      })
      .catch(() => { /* session history is non-critical */ })
  }, [sessionId])

  // Auto-scroll transcript on new entries
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcriptEntries])

  const handleSendText = () => {
    if (!textInput.trim()) return
    ariaLive.sendText(textInput.trim())
    setTranscriptEntries((prev) => [
      ...prev,
      { role: 'user', text: textInput.trim(), timestamp: new Date() },
    ])
    setTextInput('')
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-3">
          <AriaAvatar state={ariaLive.state} size="sm" />
          <div>
            <p className="text-sm font-serif text-[var(--text-primary)] leading-none">Aria</p>
            <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
              {ariaLive.isConnected ? 'Live session active' : 'Ready to connect'}
            </p>
          </div>
        </div>

        <AriaControls
          isConnected={ariaLive.isConnected}
          isMicOn={ariaLive.isMicOn}
          isCameraOn={ariaLive.isCameraOn}
          isScreenSharing={ariaLive.isScreenSharing}
          onConnect={() => { setErrorMsg(null); void ariaLive.connect() }}
          onDisconnect={ariaLive.disconnect}
          onToggleMic={ariaLive.toggleMic}
          onToggleCamera={ariaLive.toggleCamera}
          onStartScreenShare={() => void ariaLive.startScreenShare()}
          onStopScreenShare={ariaLive.stopScreenShare}
        />
      </div>

      {/* ── Idle state ───────────────────────────────────────────────────── */}
      {!ariaLive.isConnected && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 relative">
          {/* Ambient radial glow behind avatar */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 h-72 rounded-full opacity-[0.06]"
                 style={{ background: 'radial-gradient(circle, var(--gold) 0%, transparent 65%)' }} />
          </div>

          {/* Avatar */}
          <div className="relative z-10 animate-fade-up">
            <AriaAvatar state="idle" size="lg" />
          </div>

          {/* Intro copy */}
          <div className="text-center max-w-xs relative z-10 animate-fade-up" style={{ animationDelay: '80ms' }}>
            <h3 className="font-serif text-xl text-[var(--text-primary)] mb-2">Meet Aria</h3>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              Your AI consulting partner. Talk through clients, brainstorm strategies, and get
              real-time analysis from specialist agents.
            </p>
          </div>

          {/* Error */}
          {errorMsg && (
            <div
              className="relative z-10 px-4 py-3 rounded-xl text-sm max-w-sm text-center animate-fade-in"
              style={{
                background: 'rgba(220, 38, 38, 0.08)',
                border: '1px solid rgba(220, 38, 38, 0.25)',
                color: 'var(--error)',
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* CTA — hidden when Gemini is not configured */}
          {liveAvailable ? (
            <button
              onClick={() => { setErrorMsg(null); void ariaLive.connect() }}
              className="relative z-10 px-8 py-3 rounded-full bg-[var(--gold)] text-white
                         font-medium text-sm hover:bg-[var(--gold-dim)] transition-all duration-200
                         animate-fade-up hover:-translate-y-0.5"
              style={{ animationDelay: '160ms', boxShadow: '0 6px 18px var(--gold-glow)' }}
            >
              {errorMsg ? 'Retry Connection' : 'Start Live Session'}
            </button>
          ) : (
            <div className="relative z-10 px-6 py-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]
                            text-center max-w-xs animate-fade-up" style={{ animationDelay: '160ms' }}>
              <p className="text-sm text-[var(--text-primary)] mb-1">Voice mode unavailable</p>
              <p className="text-xs text-[var(--text-muted)]">
                A Gemini API key is required. Contact your admin to enable voice sessions.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Connected state — transcript ─────────────────────────────────── */}
      {ariaLive.isConnected && (
        <>
          <div ref={transcriptRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

            {/* Message bubbles */}
            {transcriptEntries.map((entry, i) => (
              <div
                key={i}
                className={`flex animate-fade-up ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                style={{ animationDuration: '0.25s' }}
              >
                <div
                  className={`max-w-[72%] rounded-2xl px-4 py-3 text-sm ${entry.isPending ? 'opacity-50' : ''}`}
                  style={entry.role === 'user'
                    ? { background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-active)' }
                    : { background: 'var(--gold-sub)',   color: 'var(--text-primary)', border: '1px solid var(--border-active)' }
                  }
                >
                  {entry.role === 'aria' && (
                    <p className="text-[10px] font-mono text-[var(--gold)] tracking-widest uppercase mb-1.5">Aria</p>
                  )}
                  {entry.role === 'aria'
                    ? <MarkdownMessage content={entry.text} />
                    : <p className={`leading-relaxed ${entry.isPending ? 'italic text-[var(--text-muted)]' : ''}`}>{entry.text}</p>
                  }
                  <span className="block text-[10px] text-[var(--text-muted)] mt-1.5">
                    {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}

            {/* Interim transcript — live speech recognition */}
            {interimText && (
              <div className="flex justify-end animate-fade-in">
                <div className="max-w-[72%] rounded-2xl px-4 py-2.5 text-sm
                                bg-[var(--bg-tertiary)] border border-[var(--border)]
                                text-[var(--text-muted)] italic">
                  <p className="text-[9px] font-mono tracking-widest uppercase mb-1 not-italic flex items-center gap-1">
                    <span className="live-dot" />
                    Listening
                  </p>
                  <p>{interimText}</p>
                </div>
              </div>
            )}

            {/* Agent activity cards */}
            {ariaLive.toolActivities.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {ariaLive.toolActivities.map((activity, i) => {
                  const agentName  = AGENT_NAMES[activity.tool] ?? activity.tool.replace(/_/g, ' ')
                  const isRunning  = activity.status === 'running'
                  const isComplete = activity.status === 'completed'

                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs border"
                      style={
                        isRunning ? {
                          background: 'rgba(217, 119, 6, 0.08)',
                          borderColor: 'rgba(217, 119, 6, 0.25)',
                          color: 'var(--warning)',
                        } : isComplete ? {
                          background: 'rgba(16, 185, 129, 0.08)',
                          borderColor: 'rgba(16, 185, 129, 0.25)',
                          color: 'var(--success)',
                        } : {
                          background: 'rgba(220, 38, 38, 0.08)',
                          borderColor: 'rgba(220, 38, 38, 0.25)',
                          color: 'var(--error)',
                        }
                      }
                    >
                      {isRunning  && <Loader2 size={12} className="animate-spin shrink-0" />}
                      {isComplete && <CheckCircle size={12} className="shrink-0" />}
                      {!isRunning && !isComplete && <XCircle size={12} className="shrink-0" />}
                      <span className="font-mono tracking-wide">
                        {isRunning ? `${agentName} is working…` : isComplete ? `${agentName} completed` : agentName}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* State indicators */}
            {ariaLive.state === 'thinking' && (
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <div className="flex gap-0.5">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full bg-[var(--gold)] animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
                <span className="font-mono">Aria is thinking…</span>
              </div>
            )}

            {ariaLive.state === 'delegating' && (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--gold)' }}>
                <Loader2 size={12} className="animate-spin" />
                <span className="font-mono">Running specialist analysis…</span>
              </div>
            )}
          </div>

          {/* Text input bar */}
          <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--bg-secondary)]">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendText() }}
                placeholder="Type to Aria…"
                aria-label="Type a message to Aria"
                className="input flex-1"
              />
              <button
                onClick={handleSendText}
                disabled={!textInput.trim()}
                aria-label="Send message"
                className="p-2.5 rounded-lg bg-[var(--gold)] text-white
                           disabled:opacity-30 hover:bg-[var(--gold-dim)] transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
