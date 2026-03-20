'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { sessions, streamMessage, type SSEEvent, type Message } from '@/lib/api'
import { VoiceInput } from '@/components/voice-input'
import {
  Send, Upload, ChevronDown, ChevronRight, DollarSign,
  Wrench, FileText, AlertTriangle, Image as ImageIcon, X,
} from 'lucide-react'

const MODE_LABELS: Record<string, string> = {
  intake: 'Intake',
  product: 'Product',
  process: 'Process',
  competitive: 'Competitive',
  stakeholder: 'Stakeholder',
}

export default function SessionPage() {
  const { id } = useParams<{ id: string }>()
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<string>('intake')
  const [streaming, setStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const [toolActivity, setToolActivity] = useState<Array<{ tool: string; status: string }>>([])
  const [sources, setSources] = useState<Array<{ sourceTitle: string; content: string; relevanceScore: number }>>([])
  const [conflicts, setConflicts] = useState<unknown[]>([])
  const [showSources, setShowSources] = useState(false)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const { data: session, refetch } = useQuery({
    queryKey: ['session', id],
    queryFn: () => sessions.get(id),
    enabled: id !== 'new',
  })

  const { data: costData } = useQuery({
    queryKey: ['session-cost', id],
    queryFn: () => sessions.getCost(id),
    enabled: id !== 'new',
    refetchInterval: 10_000,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.messages, streamContent])

  const handleSend = useCallback(() => {
    if (!input.trim() || streaming) return

    setStreaming(true)
    setStreamContent('')
    setToolActivity([])
    setSources([])
    setConflicts([])

    const controller = streamMessage(
      id,
      input.trim(),
      { mode, ...(imageBase64 ? { imageBase64 } : {}) },
      (event: SSEEvent) => {
        switch (event.type) {
          case 'tool_start':
            setToolActivity((prev) => [...prev, { tool: event['tool'] as string, status: 'running' }])
            break
          case 'tool_result':
            setToolActivity((prev) =>
              prev.map((t) => t.tool === event['tool'] ? { ...t, status: 'completed' } : t)
            )
            break
          case 'token':
            setStreamContent((prev) => prev + (event['content'] as string ?? ''))
            break
          case 'conflict_warning':
            setConflicts((prev) => [...prev, event['conflict']])
            break
          case 'sources':
            setSources(event['citations'] as Array<{ sourceTitle: string; content: string; relevanceScore: number }> ?? [])
            break
          case 'done':
            setStreaming(false)
            setStreamContent('')
            setImageBase64(null)
            setImagePreview(null)
            void refetch()
            break
        }
      }
    )

    abortRef.current = controller
    setInput('')
  }, [input, streaming, id, mode, imageBase64, refetch])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1] ?? ''
        setImageBase64(base64)
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const allMessages: Array<Message | { id: string; role: 'ASSISTANT'; content: string; streaming: true }> = [
    ...(session?.messages ?? []),
    ...(streaming && streamContent ? [{
      id: 'streaming',
      role: 'ASSISTANT' as const,
      content: streamContent,
      streaming: true as const,
    }] : []),
  ]

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="font-serif text-lg">{session?.title ?? 'New Session'}</h2>
          {session?.client && (
            <span className="badge badge-gold">{session.client.name}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* Mode Switcher */}
          <div className="flex gap-1 bg-[var(--bg-tertiary)] rounded-lg p-0.5">
            {Object.entries(MODE_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  mode === key
                    ? 'bg-[var(--gold)] text-[var(--bg-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Cost */}
          {costData && costData.totalCostUsd > 0 && (
            <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]" title="Session cost">
              <DollarSign size={12} />
              <span>${costData.totalCostUsd.toFixed(4)}</span>
            </div>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {allMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <h2 className="font-serif text-2xl text-[var(--gold)] mb-2">Start a Conversation</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-md">
              Describe your client, share a document, or ask a question.
              AXIS will route to the right specialist.
            </p>
          </div>
        )}

        {allMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'USER' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-2xl rounded-xl px-4 py-3 text-sm ${
              msg.role === 'USER'
                ? 'bg-[var(--gold)]/10 border border-[var(--gold)]/20'
                : 'bg-[var(--bg-secondary)] border border-[var(--border)]'
            }`}>
              <pre className="whitespace-pre-wrap font-[inherit]">{msg.content}</pre>
              {'streaming' in msg && msg.streaming && (
                <span className="streaming-cursor" />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Tool Activity Feed */}
      {toolActivity.length > 0 && (
        <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="flex flex-wrap gap-2">
            {toolActivity.map((t, i) => (
              <span key={i} className={`badge ${t.status === 'completed' ? 'badge-green' : 'badge-gold'}`}>
                <Wrench size={10} className="mr-1" />
                {t.tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div className="px-4 py-2 bg-[var(--warning)]/5 border-t border-[var(--warning)]/20">
          <div className="flex items-center gap-2 text-xs text-[var(--warning)]">
            <AlertTriangle size={14} />
            {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} detected — verify data before relying on it
          </div>
        </div>
      )}

      {/* Sources Panel */}
      {sources.length > 0 && (
        <div className="border-t border-[var(--border)]">
          <button
            onClick={() => setShowSources(!showSources)}
            className="flex items-center gap-2 px-4 py-2 w-full text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          >
            {showSources ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <FileText size={14} />
            {sources.length} source{sources.length > 1 ? 's' : ''}
          </button>
          {showSources && (
            <div className="px-4 pb-3 space-y-2">
              {sources.map((s, i) => (
                <div key={i} className="card text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[var(--gold)]">[{i + 1}] {s.sourceTitle}</span>
                    <span className="text-[var(--text-muted)]">{Math.round(s.relevanceScore * 100)}%</span>
                  </div>
                  <p className="text-[var(--text-muted)]">{s.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Image Preview */}
      {imagePreview && (
        <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="relative inline-block">
            <img src={imagePreview} alt="Upload preview" className="h-16 rounded-lg border border-[var(--border)]" />
            <button
              onClick={() => { setImageBase64(null); setImagePreview(null) }}
              className="absolute -top-1 -right-1 p-0.5 bg-[var(--bg-primary)] rounded-full border border-[var(--border)]"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Input Bar */}
      <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          {/* Upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
            title="Upload image"
          >
            {imageBase64 ? <ImageIcon size={18} className="text-[var(--gold)]" /> : <Upload size={18} />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Voice */}
          <VoiceInput
            onTranscript={(text) => setInput(text)}
            disabled={streaming}
          />

          {/* Text Input */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AXIS anything..."
            rows={1}
            className="input flex-1 resize-none min-h-[40px] max-h-32"
            disabled={streaming}
          />

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="btn-primary flex items-center gap-1.5 disabled:opacity-30"
          >
            <Send size={14} />
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
