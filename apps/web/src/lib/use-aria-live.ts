'use client'

// useAriaLive — Gemini = voice (ears + mouth), Claude = brain (reasoning + tools)
//
// Flow: User speaks → Gemini transcribes → Claude Opus processes →
//       Response text → Gemini speaks it back
//
// Gemini handles ONLY audio I/O. No function calling, no tools.
// All reasoning, RAG, delegation goes through Claude via /api/aria/messages

import { useRef, useState, useCallback, useEffect } from 'react'
import { aria, streamAriaMessage, type SSEEvent } from './api'

export type AriaState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'delegating' | 'error'

export interface ToolActivity {
  tool: string
  status: 'running' | 'completed' | 'error'
}

interface UseAriaLiveOptions {
  sessionId: string
  onTranscript?: (text: string, isFinal: boolean) => void
  onAriaResponse?: (text: string) => void
  onError?: (error: string) => void
}

interface UseAriaLiveReturn {
  state: AriaState
  isConnected: boolean
  connect: () => Promise<void>
  disconnect: () => void
  toggleMic: () => void
  toggleCamera: () => void
  startScreenShare: () => Promise<void>
  stopScreenShare: () => void
  sendText: (text: string) => void
  isMicOn: boolean
  isCameraOn: boolean
  isScreenSharing: boolean
  toolActivities: ToolActivity[]
}

const GEMINI_WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
const AUDIO_RATE = 24000
const SETUP_TIMEOUT = 10000
const MAX_RECONNECT_DELAY = 60000

export function useAriaLive(options: UseAriaLiveOptions): UseAriaLiveReturn {
  const { sessionId, onTranscript, onAriaResponse, onError } = options

  // State with ref mirror for closures
  const [state, _setState] = useState<AriaState>('idle')
  const stateRef = useRef<AriaState>('idle')
  const setState = useCallback((s: AriaState) => { stateRef.current = s; _setState(s) }, [])

  const [isConnected, setIsConnected] = useState(false)
  const [isMicOn, setIsMicOn] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([])

  // Refs
  const wsRef = useRef<WebSocket | null>(null)
  const playbackCtxRef = useRef<AudioContext | null>(null)
  const micCtxRef = useRef<AudioContext | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const nextPlayTimeRef = useRef(0)
  const reconnectDelayRef = useRef(2000)
  const setupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userTranscriptRef = useRef('')
  const processingRef = useRef(false)  // Prevents overlapping Claude calls

  // ─── Audio playback ────────────────────────────────────────────

  const stopAudioPlayback = useCallback(() => {
    if (playbackCtxRef.current) {
      void playbackCtxRef.current.close()
      playbackCtxRef.current = null
    }
    nextPlayTimeRef.current = 0
  }, [])

  const playAudio = useCallback(async (base64Data: string) => {
    if (!base64Data || base64Data.length < 10) return
    try {
      const ctx = playbackCtxRef.current ?? new AudioContext({ sampleRate: AUDIO_RATE })
      if (!playbackCtxRef.current) playbackCtxRef.current = ctx

      const binaryString = atob(base64Data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      const int16 = new Int16Array(bytes.buffer)
      if (int16.length === 0) return

      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) {
        float32[i] = (int16[i] ?? 0) / 32768
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, AUDIO_RATE)
      audioBuffer.getChannelData(0).set(float32)

      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)

      const now = ctx.currentTime
      const startTime = Math.max(now, nextPlayTimeRef.current)
      source.start(startTime)
      nextPlayTimeRef.current = startTime + audioBuffer.duration
    } catch (err) {
      console.warn('[AriaLive] Playback error:', err)
    }
  }, [])

  // ─── Send user text to Claude via API, get response, speak it ──

  const processWithClaude = useCallback(async (userText: string) => {
    if (processingRef.current || !userText.trim()) return
    processingRef.current = true
    setState('thinking')

    try {
      // Send to Claude via the existing Aria text endpoint
      // This does: RAG search, memory context, tool calls, delegation — everything
      const responseText = await new Promise<string>((resolve, reject) => {
        let fullText = ''
        const controller = streamAriaMessage(
          sessionId,
          userText,
          {},
          (event: SSEEvent) => {
            switch (event.type) {
              case 'tool_start':
                setToolActivities((prev) => [...prev, { tool: event['tool'] as string, status: 'running' }])
                break
              case 'tool_result':
                setToolActivities((prev) =>
                  prev.map((t) => t.tool === event['tool'] ? { ...t, status: 'completed' } : t)
                )
                break
              case 'delegation':
                setToolActivities((prev) => [...prev, {
                  tool: `delegate_${event['workerType'] as string}_analysis`,
                  status: 'running',
                }])
                setState('delegating')
                break
              case 'token':
                fullText += (event['content'] as string) ?? ''
                break
              case 'done':
                if (event['error']) {
                  reject(new Error(event['error'] as string))
                } else {
                  resolve(fullText)
                }
                break
            }
          }
        )
        // Store controller for potential cancellation
        void controller
      })

      if (!responseText.trim()) {
        setState('listening')
        processingRef.current = false
        return
      }

      // Show response in transcript
      onAriaResponse?.(responseText)

      // Send response text to Gemini to speak it
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // Use Gemini's TTS by sending the text as a "user" message
        // Gemini will generate audio for it
        wsRef.current.send(JSON.stringify({
          clientContent: {
            turns: [
              { role: 'user', parts: [{ text: `Please read this response aloud exactly as written, do not add anything:\n\n${responseText}` }] },
            ],
            turnComplete: true,
          },
        }))
        setState('speaking')
      } else {
        // Gemini not connected — just show text
        setState('listening')
      }
    } catch (err) {
      console.error('[AriaLive] Claude processing error:', err)
      onError?.(err instanceof Error ? err.message : 'Processing failed')
      setState('listening')
    } finally {
      processingRef.current = false
    }
  }, [sessionId, onAriaResponse, onError, setState])

  // ─── Cleanup ───────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (setupTimeoutRef.current) { clearTimeout(setupTimeoutRef.current); setupTimeoutRef.current = null }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach((t) => t.stop()); micStreamRef.current = null }
    if (cameraStreamRef.current) { cameraStreamRef.current.getTracks().forEach((t) => t.stop()); cameraStreamRef.current = null }
    if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach((t) => t.stop()); screenStreamRef.current = null }
    if (processorRef.current) { processorRef.current.onaudioprocess = null; processorRef.current.disconnect(); processorRef.current = null }
    if (micCtxRef.current) { void micCtxRef.current.close(); micCtxRef.current = null }
    if (playbackCtxRef.current) { void playbackCtxRef.current.close(); playbackCtxRef.current = null }
    nextPlayTimeRef.current = 0
    setIsMicOn(false); setIsCameraOn(false); setIsScreenSharing(false)
  }, [])

  useEffect(() => {
    return () => { if (wsRef.current) { wsRef.current.close(1000); wsRef.current = null }; cleanup() }
  }, [cleanup])

  // ─── Connect to Gemini (voice only — no tools) ────────────────

  const connect = useCallback(async () => {
    try {
      setState('connecting')
      const config = await aria.getSessionToken(sessionId)

      const ws = new WebSocket(`${GEMINI_WS_BASE}?key=${config.apiKey}`)
      wsRef.current = ws

      setupTimeoutRef.current = setTimeout(() => {
        if (!isConnected) { ws.close(); setState('error'); onError?.('Connection timeout') }
      }, SETUP_TIMEOUT)

      ws.onopen = () => {
        // Gemini setup — voice only, NO tools, NO function calling
        ws.send(JSON.stringify({
          setup: {
            model: `models/${config.model}`,
            generationConfig: { responseModalities: ['AUDIO'] },
            systemInstruction: {
              parts: [{ text: 'You are Aria, a voice assistant. When the user speaks, transcribe their speech. When given text to read aloud, speak it naturally in a warm, professional tone. Do not add commentary or change the content.' }],
            },
            // NO tools — all reasoning goes through Claude
          },
        }))
      }

      ws.onmessage = async (event) => {
        try {
          let data: Record<string, unknown>
          if (event.data instanceof Blob) {
            const text = await event.data.text()
            try { data = JSON.parse(text) as Record<string, unknown> }
            catch { return }  // Binary audio — handled by Gemini internally
          } else {
            data = JSON.parse(event.data as string) as Record<string, unknown>
          }

          if (data['setupComplete'] !== undefined) {
            if (setupTimeoutRef.current) { clearTimeout(setupTimeoutRef.current); setupTimeoutRef.current = null }
            setIsConnected(true)
            setState('listening')
            reconnectDelayRef.current = 2000
            return
          }

          if (data['sessionResumptionUpdate'] !== undefined) return

          const serverContent = data['serverContent'] as Record<string, unknown> | undefined
          if (serverContent) {
            if (serverContent['interrupted']) { stopAudioPlayback(); setState('listening'); return }

            // User's transcribed speech — send to Claude for processing
            const inputTranscript = serverContent['inputTranscript'] as string | undefined
            if (inputTranscript && inputTranscript.trim()) {
              userTranscriptRef.current = inputTranscript
              onTranscript?.(inputTranscript, true)
            }

            // Audio response from Gemini (speaking Claude's response)
            const parts = (serverContent['modelTurn'] as Record<string, unknown>)?.['parts'] as Array<Record<string, unknown>> | undefined
            if (parts) {
              for (const part of parts) {
                if (part['inlineData']) {
                  const audioData = part['inlineData'] as Record<string, unknown>
                  await playAudio(audioData['data'] as string)
                  setState('speaking')
                }
              }
            }

            if (serverContent['turnComplete']) {
              // If user spoke, process with Claude
              const transcript = userTranscriptRef.current
              if (transcript.trim() && !processingRef.current) {
                userTranscriptRef.current = ''
                void processWithClaude(transcript)
              } else {
                setState('listening')
              }
              nextPlayTimeRef.current = 0
              // Keep running delegation activities, clear completed ones
              setToolActivities((prev) => prev.filter((t) => t.status === 'running'))
            }
          }
        } catch (err) {
          console.error('[AriaLive] Message error:', err)
        }
      }

      ws.onerror = () => { setState('error'); onError?.('WebSocket error') }

      ws.onclose = (event) => {
        setIsConnected(false)
        if (event.code === 1000) { setState('idle'); cleanup(); return }
        const delay = reconnectDelayRef.current
        reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY)
        setState('connecting'); cleanup()
        setTimeout(() => { if (wsRef.current === ws || !wsRef.current) void connect() }, delay)
      }
    } catch (err) {
      setState('error'); onError?.(err instanceof Error ? err.message : 'Connection failed')
    }
  }, [sessionId, isConnected, onTranscript, onError, setState, playAudio, stopAudioPlayback, cleanup, processWithClaude])

  const disconnect = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(1000); wsRef.current = null }
    cleanup(); setIsConnected(false); setState('idle')
  }, [cleanup, setState])

  // ─── Mic (24kHz) ───────────────────────────────────────────────

  const toggleMic = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    if (isMicOn) {
      micStreamRef.current?.getTracks().forEach((t) => t.stop()); micStreamRef.current = null
      if (processorRef.current) { processorRef.current.onaudioprocess = null; processorRef.current.disconnect(); processorRef.current = null }
      setIsMicOn(false); return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: AUDIO_RATE, channelCount: 1 } })
      micStreamRef.current = stream
      stream.getAudioTracks()[0]?.addEventListener('ended', () => { setIsMicOn(false); micStreamRef.current = null })

      const ctx = new AudioContext({ sampleRate: AUDIO_RATE })
      micCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        const inputData = e.inputBuffer.getChannelData(0)

        // VAD — only interrupt when Aria is speaking
        if (stateRef.current === 'speaking') {
          let max = 0
          for (let i = 0; i < inputData.length; i++) { const a = Math.abs(inputData[i] ?? 0); if (a > max) max = a }
          if (max > 0.05) stopAudioPlayback()
        }

        const pcm = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          pcm[i] = Math.max(-32768, Math.min(32767, Math.floor((inputData[i] ?? 0) * 32768)))
        }
        const bytes = new Uint8Array(pcm.buffer)
        let binary = ''
        for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]!)

        wsRef.current.send(JSON.stringify({
          realtimeInput: { audio: { mimeType: `audio/pcm;rate=${AUDIO_RATE}`, data: btoa(binary) } },
        }))
      }

      source.connect(processor); processor.connect(ctx.destination)
      setIsMicOn(true); setState('listening')
    } catch (err) {
      onError?.(`Mic denied: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }, [isMicOn, onError, setState, stopAudioPlayback])

  // ─── Camera / Screen ───────────────────────────────────────────

  const toggleCamera = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    if (isCameraOn) { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); cameraStreamRef.current = null; setIsCameraOn(false); return }
    try {
      cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: true }); setIsCameraOn(true)
    } catch (err) { onError?.(`Camera denied: ${err instanceof Error ? err.message : 'Unknown'}`) }
  }, [isCameraOn, onError])

  const startScreenShare = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true }); screenStreamRef.current = stream; setIsScreenSharing(true)
      stream.getVideoTracks()[0]?.addEventListener('ended', () => { setIsScreenSharing(false); screenStreamRef.current = null })
    } catch (err) { onError?.(`Screen share denied: ${err instanceof Error ? err.message : 'Unknown'}`) }
  }, [onError])

  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop()); screenStreamRef.current = null; setIsScreenSharing(false)
  }, [])

  // ─── Text input (bypasses Gemini, goes straight to Claude) ─────

  const sendText = useCallback((text: string) => {
    onTranscript?.(text, true)
    void processWithClaude(text)
  }, [onTranscript, processWithClaude])

  return {
    state, isConnected, connect, disconnect,
    toggleMic: () => void toggleMic(),
    toggleCamera: () => void toggleCamera(),
    startScreenShare, stopScreenShare, sendText,
    isMicOn, isCameraOn, isScreenSharing, toolActivities,
  }
}
