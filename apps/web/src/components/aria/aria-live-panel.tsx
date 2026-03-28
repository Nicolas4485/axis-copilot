'use client'

// AriaLivePanel — full live-mode UI with transcript, avatar, tools, and input

import { useState, useRef, useEffect } from 'react'
import { useAriaLive } from '@/lib/use-aria-live'
import { AriaAvatar } from './aria-avatar'
import { AriaControls } from './aria-controls'
import { Send } from 'lucide-react'

interface AriaLivePanelProps {
  sessionId: string
}

interface TranscriptEntry {
  role: 'user' | 'aria'
  text: string
  timestamp: Date
}

export function AriaLivePanel({ sessionId }: AriaLivePanelProps) {
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([])
  const [textInput, setTextInput] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)

  const ariaLive = useAriaLive({
    sessionId,
    onTranscript: (text, isFinal) => {
      if (isFinal) {
        setTranscriptEntries((prev) => [
          ...prev,
          { role: 'user', text, timestamp: new Date() },
        ])
      }
    },
    onAriaResponse: (text) => {
      setTranscriptEntries((prev) => {
        // Append to last Aria entry or create new one
        const last = prev[prev.length - 1]
        if (last?.role === 'aria') {
          return [...prev.slice(0, -1), { ...last, text: last.text + text }]
        }
        return [...prev, { role: 'aria', text, timestamp: new Date() }]
      })
    },
    onError: (error) => {
      console.error('[AriaLive] Error:', error)
      setErrorMsg(error)
    },
  })

  // Auto-scroll transcript
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
      {/* Header with avatar and controls */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-4">
          <AriaAvatar state={ariaLive.state} size="sm" />
          <div>
            <h2 className="font-serif text-lg text-[var(--text-primary)]">Aria</h2>
            <p className="text-xs text-[var(--text-muted)] font-mono">
              {ariaLive.isConnected ? 'Live session active' : 'Click "Talk to Aria" to start'}
            </p>
          </div>
        </div>

        <AriaControls
          isConnected={ariaLive.isConnected}
          isMicOn={ariaLive.isMicOn}
          isCameraOn={ariaLive.isCameraOn}
          isScreenSharing={ariaLive.isScreenSharing}
          onConnect={() => void ariaLive.connect()}
          onDisconnect={ariaLive.disconnect}
          onToggleMic={ariaLive.toggleMic}
          onToggleCamera={ariaLive.toggleCamera}
          onStartScreenShare={() => void ariaLive.startScreenShare()}
          onStopScreenShare={ariaLive.stopScreenShare}
        />
      </div>

      {/* Central area — avatar when idle, transcript when active */}
      {!ariaLive.isConnected ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <AriaAvatar state="idle" size="lg" />
          <div className="text-center max-w-md">
            <h3 className="font-serif text-xl text-[var(--text-primary)] mb-2">Meet Aria</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Your AI consulting partner. Talk to Aria about your clients,
              brainstorm strategies, and get real-time analysis from specialist agents.
            </p>
          </div>
          {errorMsg && (
            <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm max-w-md text-center">
              {errorMsg}
            </div>
          )}
          <button
            onClick={() => { setErrorMsg(null); void ariaLive.connect() }}
            className="px-6 py-3 rounded-lg bg-[var(--gold)] text-black font-mono text-sm hover:opacity-90 transition-opacity"
          >
            {errorMsg ? 'Retry Connection' : 'Start Live Session'}
          </button>
        </div>
      ) : (
        <>
          {/* Transcript */}
          <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {transcriptEntries.map((entry, i) => (
              <div
                key={i}
                className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-xl px-4 py-3 text-sm ${
                    entry.role === 'user'
                      ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]'
                      : 'bg-[var(--gold)]/10 text-[var(--text-primary)] border border-[var(--gold)]/20'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{entry.text}</p>
                  <span className="text-xs text-[var(--text-muted)] mt-1 block">
                    {entry.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}

            {/* Tool activity */}
            {ariaLive.toolActivities.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {ariaLive.toolActivities.map((activity, i) => (
                  <span
                    key={i}
                    className={`text-xs px-2 py-1 rounded-full font-mono ${
                      activity.status === 'running'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : activity.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {activity.tool.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}

            {/* Aria state indicator */}
            {ariaLive.state === 'thinking' && (
              <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)] animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)] animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                Aria is thinking...
              </div>
            )}

            {ariaLive.state === 'delegating' && (
              <div className="flex items-center gap-2 text-sm text-purple-400">
                <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                Running specialist analysis...
              </div>
            )}
          </div>

          {/* Text input (for typing during live session) */}
          <div className="p-4 border-t border-[var(--border)]">
            <div className="flex gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                placeholder="Type a message to Aria..."
                className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] text-sm focus:outline-none focus:border-[var(--gold)] transition-colors"
              />
              <button
                onClick={handleSendText}
                disabled={!textInput.trim()}
                className="px-3 py-2 rounded-lg bg-[var(--gold)] text-black disabled:opacity-30 transition-opacity"
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
