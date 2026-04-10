'use client'

// useAriaLive — React hook for Gemini Live WebSocket (voice/video/screen)
// Fixes applied: audio rate 24kHz, binary handling, setup timeout,
// exponential backoff, transcript consolidation, state management

import { useRef, useState, useCallback, useEffect } from 'react'
import { aria } from './api'

export type AriaState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'delegating' | 'error'

export interface ToolActivity {
  tool: string
  status: 'running' | 'completed' | 'error'
}

interface UseAriaLiveOptions {
  sessionId: string
  onTranscript?: (text: string, isFinal: boolean) => void
  onAriaResponse?: (text: string) => void
  onToolActivity?: (activities: ToolActivity[]) => void
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

const GEMINI_LIVE_WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
const AUDIO_SAMPLE_RATE = 24000  // Gemini Live uses 24kHz
const SETUP_TIMEOUT_MS = 10000
const MAX_RECONNECT_DELAY_MS = 60000

export function useAriaLive(options: UseAriaLiveOptions): UseAriaLiveReturn {
  const { sessionId, onTranscript, onAriaResponse, onToolActivity, onError } = options

  const [state, _setState] = useState<AriaState>('idle')
  const stateRef = useRef<AriaState>('idle')
  const setState = useCallback((s: AriaState) => { stateRef.current = s; _setState(s) }, [])
  const [isConnected, setIsConnected] = useState(false)
  const [isMicOn, setIsMicOn] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([])

  // Refs for WebSocket, audio, and streams
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

  // Turn tracking for transcript persistence
  const currentAriaTextRef = useRef('')
  const currentUserTextRef = useRef('')

  // ─── Transcript persistence ─────────────────────────────────────

  const saveTranscript = useCallback((userText: string, ariaText: string) => {
    if (!userText.trim() && !ariaText.trim()) return
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'
    const token = typeof window !== 'undefined' ? localStorage.getItem('axis_token') : null
    fetch(`${apiUrl}/api/aria/save-transcript`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ sessionId, userText, ariaText }),
    }).catch((err) => {
      console.warn('[AriaLive] Transcript save failed:', err)
    })
  }, [sessionId])

  // ─── Audio playback (queued, 24kHz) ────────────────────────────

  const stopAudioPlayback = useCallback(() => {
    if (playbackCtxRef.current) {
      void playbackCtxRef.current.close()
      playbackCtxRef.current = null
    }
    nextPlayTimeRef.current = 0
  }, [])

  const playAudio = useCallback(async (base64Data: string) => {
    try {
      if (!base64Data || base64Data.length < 10) return

      const ctx = playbackCtxRef.current ?? new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE })
      if (!playbackCtxRef.current) playbackCtxRef.current = ctx

      const binaryString = atob(base64Data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Gemini sends PCM int16 at 24kHz
      const int16 = new Int16Array(bytes.buffer)
      if (int16.length === 0) return

      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) {
        float32[i] = (int16[i] ?? 0) / 32768
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, AUDIO_SAMPLE_RATE)
      audioBuffer.getChannelData(0).set(float32)

      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)

      const now = ctx.currentTime
      const startTime = Math.max(now, nextPlayTimeRef.current)
      source.start(startTime)
      nextPlayTimeRef.current = startTime + audioBuffer.duration
    } catch (err) {
      console.warn('[AriaLive] Audio playback error:', err)
    }
  }, [])

  // ─── Cleanup ───────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (setupTimeoutRef.current) {
      clearTimeout(setupTimeoutRef.current)
      setupTimeoutRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop())
      micStreamRef.current = null
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop())
      cameraStreamRef.current = null
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = null
    }
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (micCtxRef.current) {
      void micCtxRef.current.close()
      micCtxRef.current = null
    }
    if (playbackCtxRef.current) {
      void playbackCtxRef.current.close()
      playbackCtxRef.current = null
    }
    nextPlayTimeRef.current = 0
    setIsMicOn(false)
    setIsCameraOn(false)
    setIsScreenSharing(false)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close(1000)
        wsRef.current = null
      }
      cleanup()
    }
  }, [cleanup])

  // ─── Connect ───────────────────────────────────────────────────

  const connect = useCallback(async () => {
    try {
      setState('connecting')

      const config = await aria.getSessionToken(sessionId)

      const wsUrl = `${GEMINI_LIVE_WS_BASE}?key=${config.apiKey}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      // Setup timeout — if Gemini doesn't respond in 10s, fail
      setupTimeoutRef.current = setTimeout(() => {
        if (!isConnected) {
          ws.close()
          setState('error')
          onError?.('Connection timeout — Gemini did not respond')
        }
      }, SETUP_TIMEOUT_MS)

      ws.onopen = () => {
        ws.send(JSON.stringify({
          setup: {
            model: `models/${config.model}`,
            generationConfig: { responseModalities: ['AUDIO'] },
            systemInstruction: { parts: [{ text: config.systemInstruction }] },
            tools: [{
              functionDeclarations: config.tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: t.input_schema,
              })),
            }],
          },
        }))
      }

      ws.onmessage = async (event) => {
        try {
          let data: Record<string, unknown>

          if (event.data instanceof Blob) {
            const text = await event.data.text()
            try {
              data = JSON.parse(text) as Record<string, unknown>
            } catch {
              // Binary audio data — play it directly
              // Don't treat as setupComplete
              return
            }
          } else {
            data = JSON.parse(event.data as string) as Record<string, unknown>
          }

          // Setup complete
          if (data['setupComplete'] !== undefined) {
            if (setupTimeoutRef.current) {
              clearTimeout(setupTimeoutRef.current)
              setupTimeoutRef.current = null
            }
            setIsConnected(true)
            setState('listening')
            reconnectDelayRef.current = 2000  // Reset backoff on successful connection
            return
          }

          // Session resumption updates — ignore silently
          if (data['sessionResumptionUpdate'] !== undefined) return

          // Server content (text/audio responses)
          const serverContent = data['serverContent'] as Record<string, unknown> | undefined
          if (serverContent) {
            if (serverContent['interrupted']) {
              stopAudioPlayback()
              setState('listening')
              return
            }

            // Capture user's speech transcript
            const inputTranscript = serverContent['inputTranscript'] as string | undefined
            if (inputTranscript) {
              currentUserTextRef.current = inputTranscript
              onTranscript?.(inputTranscript, true)
            }

            // Process model response parts
            const parts = (serverContent['modelTurn'] as Record<string, unknown>)?.['parts'] as Array<Record<string, unknown>> | undefined
            let hasContent = false
            if (parts) {
              for (const part of parts) {
                if (part['text']) {
                  currentAriaTextRef.current += part['text'] as string
                  onAriaResponse?.(part['text'] as string)
                  hasContent = true
                }
                if (part['inlineData']) {
                  const audioData = part['inlineData'] as Record<string, unknown>
                  await playAudio(audioData['data'] as string)
                  hasContent = true
                }
              }
              if (hasContent) setState('speaking')
            }

            // Turn complete — save transcript and reset
            if (serverContent['turnComplete']) {
              setState('listening')
              nextPlayTimeRef.current = 0

              // Save both user and Aria text together
              const userText = currentUserTextRef.current
              const ariaText = currentAriaTextRef.current
              if (userText.trim() || ariaText.trim()) {
                saveTranscript(userText, ariaText)
              }
              currentUserTextRef.current = ''
              currentAriaTextRef.current = ''

              // Clear completed/error activities, keep running ones (delegations in progress)
              setToolActivities((prev) => prev.filter((t) => t.status === 'running'))
            }
          }

          // Tool calls
          const toolCall = data['toolCall'] as Record<string, unknown> | undefined
          if (toolCall) {
            const functionCalls = toolCall['functionCalls'] as Array<Record<string, unknown>> | undefined
            if (functionCalls) {
              try {
                await handleFunctionCalls(functionCalls)
              } catch (err) {
                console.error('[AriaLive] Function call error:', err)
              }
            }
          }
        } catch (err) {
          console.error('[AriaLive] Message parse error:', err)
        }
      }

      ws.onerror = () => {
        setState('error')
        onError?.('WebSocket connection error')
      }

      ws.onclose = (event) => {
        setIsConnected(false)

        if (event.code === 1000) {
          setState('idle')
          cleanup()
          return
        }

        // Unexpected close — reconnect with exponential backoff
        const delay = reconnectDelayRef.current
        reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS)
        setState('connecting')
        cleanup()

        setTimeout(() => {
          if (wsRef.current === ws || wsRef.current === null) {
            void connect()
          }
        }, delay)
      }
    } catch (err) {
      setState('error')
      onError?.(err instanceof Error ? err.message : 'Connection failed')
    }
  }, [sessionId, isConnected, onAriaResponse, onTranscript, onError, saveTranscript, playAudio, stopAudioPlayback, cleanup])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000)  // Normal close — no reconnect
      wsRef.current = null
    }
    cleanup()
    setIsConnected(false)
    setState('idle')
  }, [cleanup])

  // ─── Mic control (24kHz to match Gemini) ───────────────────────

  const toggleMic = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    if (isMicOn) {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop())
        micStreamRef.current = null
      }
      if (processorRef.current) {
        processorRef.current.onaudioprocess = null
        processorRef.current.disconnect()
        processorRef.current = null
      }
      setIsMicOn(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: AUDIO_SAMPLE_RATE, channelCount: 1 },
      })
      micStreamRef.current = stream

      // Track if mic is externally stopped
      stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        setIsMicOn(false)
        micStreamRef.current = null
      })

      const ctx = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE })
      micCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

        const inputData = e.inputBuffer.getChannelData(0)

        // Voice activity detection — only interrupt during speaking (not during delegation/thinking)
        if (stateRef.current === 'speaking') {
          let maxAmplitude = 0
          for (let i = 0; i < inputData.length; i++) {
            const abs = Math.abs(inputData[i] ?? 0)
            if (abs > maxAmplitude) maxAmplitude = abs
          }
          if (maxAmplitude > 0.05) {  // Higher threshold to avoid background noise
            stopAudioPlayback()
          }
        }

        // Convert float32 → int16 PCM
        const pcm = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          pcm[i] = Math.max(-32768, Math.min(32767, Math.floor((inputData[i] ?? 0) * 32768)))
        }

        // Base64 encode and send
        const bytes = new Uint8Array(pcm.buffer)
        let binary = ''
        for (let j = 0; j < bytes.length; j++) {
          binary += String.fromCharCode(bytes[j]!)
        }
        wsRef.current.send(JSON.stringify({
          realtimeInput: {
            audio: { mimeType: `audio/pcm;rate=${AUDIO_SAMPLE_RATE}`, data: btoa(binary) },
          },
        }))
      }

      source.connect(processor)
      processor.connect(ctx.destination)
      setIsMicOn(true)
      setState('listening')
    } catch (err) {
      onError?.(`Microphone access denied: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }, [isMicOn, onError, stopAudioPlayback])

  // ─── Camera / Screen share ─────────────────────────────────────

  const toggleCamera = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    if (isCameraOn) {
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop())
      cameraStreamRef.current = null
      setIsCameraOn(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      cameraStreamRef.current = stream
      setIsCameraOn(true)
    } catch (err) {
      onError?.(`Camera access denied: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }, [isCameraOn, onError])

  const startScreenShare = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      screenStreamRef.current = stream
      setIsScreenSharing(true)
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        setIsScreenSharing(false)
        screenStreamRef.current = null
      })
    } catch (err) {
      onError?.(`Screen share denied: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }, [onError])

  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop())
    screenStreamRef.current = null
    setIsScreenSharing(false)
  }, [])

  // ─── Text input ────────────────────────────────────────────────

  const sendText = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ realtimeInput: { text } }))
    setState('thinking')
    currentUserTextRef.current = text
  }, [])

  // ─── Function call relay ──────────────────────────────────────

  const handleFunctionCalls = useCallback(async (calls: Array<Record<string, unknown>>) => {
    setState('delegating')
    const responses: Array<Record<string, unknown>> = []

    for (const call of calls) {
      const name = call['name'] as string
      const args = call['args'] as Record<string, unknown>
      const id = call['id'] as string

      setToolActivities((prev) => [...prev, { tool: name, status: 'running' }])

      try {
        let resultData: unknown

        if (name.startsWith('delegate_')) {
          const workerNames: Record<string, string> = {
            delegate_product_analysis: 'Sean',
            delegate_process_analysis: 'Kevin',
            delegate_competitive_analysis: 'Mel',
            delegate_stakeholder_analysis: 'Anjie',
          }
          const workerTypeMap: Record<string, string> = {
            delegate_product_analysis: 'product',
            delegate_process_analysis: 'process',
            delegate_competitive_analysis: 'competitive',
            delegate_stakeholder_analysis: 'stakeholder',
          }
          const workerName = workerNames[name] ?? 'Agent'
          const workerType = workerTypeMap[name] ?? 'product'

          // Fire async — don't block
          const imageArg = args['imageBase64'] as string | undefined
          aria.delegate({
            sessionId,
            workerType,
            query: (args['query'] as string) ?? '',
            ...(imageArg ? { imageBase64: imageArg } : {}),
          }).then(() => {
            setToolActivities((prev) =>
              prev.map((t) => t.tool === name ? { ...t, status: 'completed' } : t)
            )
            onAriaResponse?.(`\n\n✅ **${workerName} completed their analysis.**\n`)
          }).catch(() => {
            setToolActivities((prev) =>
              prev.map((t) => t.tool === name ? { ...t, status: 'error' } : t)
            )
            onAriaResponse?.(`\n\n⚠️ ${workerName} encountered an error.\n`)
          })

          resultData = { status: 'delegated', agent: workerName, message: `${workerName} is working on this.` }
        } else {
          const result = await aria.toolCall({ sessionId, toolName: name, toolInput: args })
          resultData = result.result
          setToolActivities((prev) =>
            prev.map((t) => t.tool === name ? { ...t, status: 'completed' } : t)
          )
        }

        responses.push({ id, name, response: { output: resultData } })
      } catch (err) {
        responses.push({ id, name, response: { output: { error: err instanceof Error ? err.message : 'Failed' } } })
        setToolActivities((prev) =>
          prev.map((t) => t.tool === name ? { ...t, status: 'error' } : t)
        )
      }
    }

    // Send responses back to Gemini
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ toolResponse: { functionResponses: responses } }))
    }
    setState('thinking')
  }, [sessionId, onAriaResponse])

  return {
    state,
    isConnected,
    connect,
    disconnect,
    toggleMic: () => void toggleMic(),
    toggleCamera: () => void toggleCamera(),
    startScreenShare,
    stopScreenShare,
    sendText,
    isMicOn,
    isCameraOn,
    isScreenSharing,
    toolActivities,
  }
}
