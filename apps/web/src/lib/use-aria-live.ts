'use client'

// useAriaLive — React hook for Gemini Live WebSocket (voice/video/screen)
// Manages the full lifecycle: connect, audio capture, function call relay, playback

import { useRef, useState, useCallback, useEffect } from 'react'
import { aria } from './api'
import type { AriaSessionToken } from './api'

export type AriaState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'delegating' | 'error'

interface ToolActivity {
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
  transcript: string
  toolActivities: ToolActivity[]
}

const GEMINI_LIVE_WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

export function useAriaLive(options: UseAriaLiveOptions): UseAriaLiveReturn {
  const { sessionId, onTranscript, onAriaResponse, onToolActivity, onError } = options

  const [state, setState] = useState<AriaState>('idle')
  const [isConnected, setIsConnected] = useState(false)
  const [isMicOn, setIsMicOn] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sessionConfigRef = useRef<AriaSessionToken | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connect = useCallback(async () => {
    try {
      setState('connecting')
      console.log('[AriaLive] Connecting...')

      // Get session token from backend
      const config = await aria.getSessionToken(sessionId)
      sessionConfigRef.current = config
      console.log('[AriaLive] Got session config, model:', config.model)

      // Open WebSocket to Gemini Live
      const wsUrl = `${GEMINI_LIVE_WS_BASE}?key=${config.apiKey}`
      console.log('[AriaLive] Opening WebSocket to:', wsUrl.replace(config.apiKey, 'API_KEY_HIDDEN'))
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[AriaLive] WebSocket opened, sending setup...')
        const setupMessage = {
          setup: {
            model: `models/${config.model}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Aoede' },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: config.systemInstruction }],
            },
            tools: [{
              functionDeclarations: config.tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: t.input_schema,
              })),
            }],
          },
        }
        console.log('[AriaLive] Sending setup for model:', config.model)
        ws.send(JSON.stringify(setupMessage))
      }

      ws.onmessage = async (event) => {
        try {
          let data: Record<string, unknown>

          if (event.data instanceof Blob) {
            // Binary message — could be setupComplete or audio
            const text = await event.data.text()
            try {
              data = JSON.parse(text) as Record<string, unknown>
            } catch {
              // Binary audio data or setupComplete (non-JSON binary)
              if (!isConnected) {
                console.log('[AriaLive] Setup complete (binary response) — ready')
                setIsConnected(true)
                setState('listening')
              }
              // TODO: handle audio playback for binary audio chunks
              return
            }
          } else {
            data = JSON.parse(event.data as string) as Record<string, unknown>
          }

          console.log('[AriaLive] Received message keys:', Object.keys(data))

          // Handle setup complete — NOW we're connected
          if (data['setupComplete'] !== undefined) {
            console.log('[AriaLive] Setup complete (JSON) — ready')
            setIsConnected(true)
            setState('listening')
            return
          }

          // Handle server content (text/audio responses)
          const serverContent = data['serverContent'] as Record<string, unknown> | undefined
          if (serverContent) {
            const parts = (serverContent['modelTurn'] as Record<string, unknown>)?.['parts'] as Array<Record<string, unknown>> | undefined
            if (parts) {
              for (const part of parts) {
                if (part['text']) {
                  const text = part['text'] as string
                  onAriaResponse?.(text)
                  setState('speaking')
                }
                if (part['inlineData']) {
                  // Audio data — play it
                  const audioData = part['inlineData'] as Record<string, unknown>
                  await playAudio(audioData['data'] as string, audioData['mimeType'] as string)
                  setState('speaking')
                }
              }
            }

            if (serverContent['turnComplete']) {
              setState('listening')
              // Reset audio queue for next turn
              nextPlayTimeRef.current = 0
            }
          }

          // Handle tool calls
          const toolCall = data['toolCall'] as Record<string, unknown> | undefined
          if (toolCall) {
            const functionCalls = toolCall['functionCalls'] as Array<Record<string, unknown>> | undefined
            if (functionCalls) {
              await handleFunctionCalls(functionCalls)
            }
          }

        } catch (err) {
          console.error('[AriaLive] Message parse error:', err)
        }
      }

      ws.onerror = (event) => {
        console.error('[AriaLive] WebSocket error:', event)
        setState('error')
        onError?.('WebSocket connection failed — check console for details')
      }

      ws.onclose = (event) => {
        console.log('[AriaLive] WebSocket closed:', event.code, event.reason)
        setIsConnected(false)

        if (event.code === 1000) {
          // Normal close (user disconnected)
          setState('idle')
          cleanup()
          return
        }

        // Unexpected close — auto-reconnect
        const reason = event.reason || `code ${event.code}`
        console.log(`[AriaLive] Unexpected close: ${reason} — reconnecting in 2s...`)
        setState('connecting')
        cleanup()

        // Auto-reconnect after 2 seconds
        setTimeout(() => {
          if (wsRef.current === ws || wsRef.current === null) {
            console.log('[AriaLive] Auto-reconnecting...')
            void connect()
          }
        }, 2000)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Connection failed'
      setState('error')
      onError?.(errorMsg)
    }
  }, [sessionId, onAriaResponse, onError])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    cleanup()
    setIsConnected(false)
    setState('idle')
  }, [])

  const cleanup = useCallback(() => {
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
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }
    setIsMicOn(false)
    setIsCameraOn(false)
    setIsScreenSharing(false)
  }, [])

  const toggleMic = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    if (isMicOn) {
      // Stop mic
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop())
        micStreamRef.current = null
      }
      if (processorRef.current) {
        processorRef.current.disconnect()
        processorRef.current = null
      }
      setIsMicOn(false)
      return
    }

    try {
      // Start mic capture
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1 },
      })
      micStreamRef.current = stream

      const ctx = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

        const inputData = e.inputBuffer.getChannelData(0)
        // Convert float32 to int16 PCM
        const pcm = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const sample = inputData[i] ?? 0
          pcm[i] = Math.max(-32768, Math.min(32767, Math.floor(sample * 32768)))
        }

        // Base64 encode and send
        const bytes = new Uint8Array(pcm.buffer)
        let binary = ''
        for (let j = 0; j < bytes.length; j++) {
          binary += String.fromCharCode(bytes[j]!)
        }
        const base64 = btoa(binary)
        wsRef.current.send(JSON.stringify({
          realtimeInput: {
            audio: { mimeType: 'audio/pcm;rate=16000', data: base64 },
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
  }, [isMicOn, onError])

  const toggleCamera = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    if (isCameraOn) {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop())
        cameraStreamRef.current = null
      }
      setIsCameraOn(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      cameraStreamRef.current = stream
      setIsCameraOn(true)
      // Video frames sent to Gemini handled by browser's MediaStream
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
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = null
    }
    setIsScreenSharing(false)
  }, [])

  const sendText = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    wsRef.current.send(JSON.stringify({
      realtimeInput: { text },
    }))
    console.log('[AriaLive] Sent text:', text.slice(0, 100))
    setState('thinking')
  }, [])

  // ─── Function call relay ──────────────────────────────────────

  const handleFunctionCalls = useCallback(async (calls: Array<Record<string, unknown>>) => {
    setState('delegating')
    const responses: Array<Record<string, unknown>> = []

    for (const call of calls) {
      const name = call['name'] as string
      const args = call['args'] as Record<string, unknown>
      const id = call['id'] as string

      const activity: ToolActivity = { tool: name, status: 'running' }
      setToolActivities((prev) => [...prev, activity])

      try {
        let resultData: unknown

        // Check if this is a delegation
        if (name.startsWith('delegate_')) {
          const workerTypeMap: Record<string, string> = {
            delegate_product_analysis: 'product',
            delegate_process_analysis: 'process',
            delegate_competitive_analysis: 'competitive',
            delegate_stakeholder_analysis: 'stakeholder',
          }
          const workerType = workerTypeMap[name] ?? 'product'

          const imageArg = args['imageBase64'] as string | undefined
          const result = await aria.delegate({
            sessionId,
            workerType,
            query: (args['query'] as string) ?? '',
            ...(imageArg ? { imageBase64: imageArg } : {}),
          })
          resultData = { content: result.content, toolsUsed: result.toolsUsed }
        } else {
          const result = await aria.toolCall({
            sessionId,
            toolName: name,
            toolInput: args,
          })
          resultData = result.result
        }

        responses.push({ id, name, response: { result: resultData } })
        setToolActivities((prev) =>
          prev.map((t) => t.tool === name ? { ...t, status: 'completed' } : t)
        )
      } catch (err) {
        responses.push({ id, name, response: { error: err instanceof Error ? err.message : 'Failed' } })
        setToolActivities((prev) =>
          prev.map((t) => t.tool === name ? { ...t, status: 'error' } : t)
        )
      }
    }

    // Send function responses back to Gemini
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        toolResponse: { functionResponses: responses },
      }))
    }

    onToolActivity?.(toolActivities)
  }, [sessionId, toolActivities, onToolActivity])

  // ─── Audio playback (queued to avoid overlap) ──────────────────

  const nextPlayTimeRef = useRef(0)

  const playAudio = useCallback(async (base64Data: string, _mimeType: string) => {
    try {
      const ctx = audioContextRef.current ?? new AudioContext({ sampleRate: 24000 })
      if (!audioContextRef.current) audioContextRef.current = ctx

      const binaryString = atob(base64Data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Gemini Live sends PCM int16 at 24kHz
      const int16 = new Int16Array(bytes.buffer)
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) {
        float32[i] = (int16[i] ?? 0) / 32768
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, 24000)
      audioBuffer.getChannelData(0).set(float32)

      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)

      // Queue chunks sequentially — don't overlap
      const now = ctx.currentTime
      const startTime = Math.max(now, nextPlayTimeRef.current)
      source.start(startTime)
      nextPlayTimeRef.current = startTime + audioBuffer.duration
    } catch (err) {
      console.warn('[AriaLive] Audio playback error:', err)
    }
  }, [])

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
    transcript,
    toolActivities,
  }
}
