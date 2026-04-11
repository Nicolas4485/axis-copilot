'use client'

// useAriaLive — connects to the server-side Gemini Live WebSocket proxy.
//
// Architecture change (SEC-1 fix):
//   BEFORE: frontend → Gemini directly (API key in browser)
//   AFTER:  frontend → backend /api/aria/live → Gemini (API key stays on server)
//
// Gemini now handles both voice I/O AND reasoning/tools in live mode.
// The backend proxy executes tool calls server-side and notifies us via
// {type:"tool_start"} / {type:"tool_result"} events on the same WebSocket.
//
// Audio capture fix: uses AudioWorkletNode instead of the deprecated
// ScriptProcessorNode. The worklet runs on a dedicated audio thread so React
// re-renders can never delay or drop microphone frames.

import { useRef, useState, useCallback, useEffect } from 'react'

export type AriaState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'delegating'
  | 'error'

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

const MIC_RATE = 16000            // Gemini Live input expects 16 kHz PCM
const PLAYBACK_RATE = 24000       // Gemini Live output is 24 kHz PCM
const JITTER_BUFFER_S = 0.12      // 120 ms pre-buffer before starting playback
const BACKPRESSURE_LIMIT = 65536  // 64 KB — skip mic frame if WS buffer exceeds this
const SETUP_TIMEOUT = 15_000      // ms to wait for backend "ready" event
const MAX_RECONNECT_DELAY = 60_000
const SCREEN_FRAME_INTERVAL = 2000 // ms between screen-share frames
// RMS amplitude threshold for voice-activity detection. Uses RMS (not peak)
// to avoid stopping Aria on brief ambient noise transients.
const VAD_RMS_THRESHOLD = 0.02

// Heartbeat interval: send a no-op message to keep the proxy WebSocket alive
// through proxies/firewalls that drop idle connections after 60 s.
const HEARTBEAT_INTERVAL_MS = 25_000

// Derive WebSocket URL from the API base (http→ws, https→wss)
const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

export function useAriaLive(options: UseAriaLiveOptions): UseAriaLiveReturn {
  const { sessionId, onTranscript, onAriaResponse, onError } = options

  // ── State with ref mirrors for use inside closures ─────────────────────────
  const [state, _setState] = useState<AriaState>('idle')
  const stateRef = useRef<AriaState>('idle')
  const setState = useCallback((s: AriaState) => {
    stateRef.current = s
    _setState(s)
  }, [])

  const [isConnected, setIsConnected] = useState(false)
  const [isMicOn, setIsMicOn] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([])

  // ── Refs ───────────────────────────────────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null)
  const playbackCtxRef = useRef<AudioContext | null>(null)
  const micCtxRef = useRef<AudioContext | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  // Worklet node (primary) and legacy ScriptProcessor fallback
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const nextPlayTimeRef = useRef(0)
  const reconnectDelayRef = useRef(2000)
  const setupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const screenFrameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)

  // ── Audio playback ─────────────────────────────────────────────────────────

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
      const ctx = playbackCtxRef.current ?? new AudioContext({ sampleRate: PLAYBACK_RATE })
      if (!playbackCtxRef.current) playbackCtxRef.current = ctx

      // Resume if the browser suspended the context (tab backgrounded, idle policy).
      // Without this, source.start() silently schedules audio that never plays.
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

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

      const audioBuffer = ctx.createBuffer(1, float32.length, PLAYBACK_RATE)
      audioBuffer.getChannelData(0).set(float32)

      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)

      const now = ctx.currentTime
      // If audio is still queued (within 50 ms of future), chain from it.
      // Otherwise re-prime with a jitter buffer so chunks have time to arrive.
      const startTime = nextPlayTimeRef.current > now - 0.05
        ? nextPlayTimeRef.current
        : now + JITTER_BUFFER_S
      source.start(startTime)
      nextPlayTimeRef.current = startTime + audioBuffer.duration
    } catch (err) {
      console.warn('[AriaLive] Playback error:', err)
    }
  }, [])

  // ── Mic capture teardown ───────────────────────────────────────────────────

  const stopMicCapture = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.port.onmessage = null
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null
      processorRef.current.disconnect()
      processorRef.current = null
    }
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
    if (micCtxRef.current) { void micCtxRef.current.close(); micCtxRef.current = null }
  }, [])

  // ── Cleanup ────────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (setupTimeoutRef.current) { clearTimeout(setupTimeoutRef.current); setupTimeoutRef.current = null }
    if (screenFrameTimerRef.current) { clearInterval(screenFrameTimerRef.current); screenFrameTimerRef.current = null }
    if (heartbeatTimerRef.current) { clearInterval(heartbeatTimerRef.current); heartbeatTimerRef.current = null }
    stopMicCapture()
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); cameraStreamRef.current = null
    screenStreamRef.current?.getTracks().forEach((t) => t.stop()); screenStreamRef.current = null
    if (playbackCtxRef.current) { void playbackCtxRef.current.close(); playbackCtxRef.current = null }
    screenCanvasRef.current = null
    screenVideoRef.current = null
    nextPlayTimeRef.current = 0
    setIsMicOn(false); setIsCameraOn(false); setIsScreenSharing(false)
  }, [stopMicCapture])

  useEffect(() => {
    return () => {
      if (wsRef.current) { wsRef.current.close(1000); wsRef.current = null }
      cleanup()
    }
  }, [cleanup])

  // ── Send a screen frame to the backend (proxied to Gemini as image/jpeg) ───

  const sendScreenFrame = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    if (!screenStreamRef.current) return

    const videoTrack = screenStreamRef.current.getVideoTracks()[0]
    if (!videoTrack || videoTrack.readyState !== 'live') return

    // Use ImageCapture API when available (Chrome/Edge).
    // TypeScript's DOM lib doesn't include ImageCapture, so we access it via window.
    type ImageCaptureAPI = { grabFrame(): Promise<ImageBitmap> }
    type ImageCaptureConstructor = new (track: MediaStreamTrack) => ImageCaptureAPI
    const ImageCaptureClass = (window as unknown as { ImageCapture?: ImageCaptureConstructor }).ImageCapture

    if (ImageCaptureClass) {
      const capture = new ImageCaptureClass(videoTrack)
      capture.grabFrame()
        .then((bitmap) => {
          const maxW = 1280
          const scale = Math.min(1, maxW / bitmap.width)
          const w = Math.floor(bitmap.width * scale)
          const h = Math.floor(bitmap.height * scale)

          const canvas = screenCanvasRef.current ?? document.createElement('canvas')
          screenCanvasRef.current = canvas
          canvas.width = w
          canvas.height = h

          const ctx = canvas.getContext('2d')
          if (!ctx) return
          ctx.drawImage(bitmap, 0, 0, w, h)

          const data = canvas.toDataURL('image/jpeg', 0.7).split(',')[1] ?? ''
          if (data && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              realtimeInput: { video: { mimeType: 'image/jpeg', data } },
            }))
          }
        })
        .catch(() => { /* Transient grab failures are safe to ignore */ })
    } else {
      // Fallback: draw the track via a hidden <video> element
      const video = screenVideoRef.current ?? document.createElement('video')
      if (!screenVideoRef.current) {
        screenVideoRef.current = video
        video.muted = true
        video.srcObject = screenStreamRef.current
        void video.play()
      }

      if (video.readyState < 2) return

      const maxW = 1280
      const scale = Math.min(1, maxW / video.videoWidth)
      const w = Math.floor(video.videoWidth * scale)
      const h = Math.floor(video.videoHeight * scale)
      if (w === 0 || h === 0) return

      const canvas = screenCanvasRef.current ?? document.createElement('canvas')
      screenCanvasRef.current = canvas
      canvas.width = w
      canvas.height = h

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0, w, h)

      const data = canvas.toDataURL('image/jpeg', 0.7).split(',')[1] ?? ''
      if (data && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          realtimeInput: { video: { mimeType: 'image/jpeg', data } },
        }))
      }
    }
  }, [])

  // ── Connect to backend proxy ───────────────────────────────────────────────

  const connect = useCallback(async () => {
    try {
      setState('connecting')

      const token = typeof window !== 'undefined' ? localStorage.getItem('axis_token') : null
      if (!token) throw new Error('Not authenticated')

      const url = `${WS_BASE}/api/aria/live?sessionId=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(token)}`
      const ws = new WebSocket(url)
      wsRef.current = ws

      // Guard: if backend doesn't confirm ready within SETUP_TIMEOUT, close
      setupTimeoutRef.current = setTimeout(() => {
        if (stateRef.current === 'connecting') {
          ws.close()
          setState('error')
          onError?.('Connection timeout — server did not respond')
        }
      }, SETUP_TIMEOUT)

      ws.onmessage = async (event) => {
        let data: Record<string, unknown>
        try {
          const text = event.data instanceof Blob ? await event.data.text() : (event.data as string)
          data = JSON.parse(text) as Record<string, unknown>
        } catch {
          // Non-JSON binary — ignore (shouldn't happen with the proxy in place)
          return
        }

        // ── Backend control events ──────────────────────────────────────────

        const msgType = data['type'] as string | undefined

        if (msgType === 'ready') {
          if (setupTimeoutRef.current) { clearTimeout(setupTimeoutRef.current); setupTimeoutRef.current = null }
          setIsConnected(true)
          setState('listening')
          reconnectDelayRef.current = 2000

          // Client-side heartbeat: keeps the proxy WS alive through proxies that
          // time out idle connections. The server recognises this type and
          // swallows it — it never reaches Gemini.
          if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current)
          heartbeatTimerRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'heartbeat' }))
            }
          }, HEARTBEAT_INTERVAL_MS)

          return
        }

        if (msgType === 'error') {
          onError?.(data['message'] as string ?? 'Server error')
          return
        }

        if (msgType === 'tool_start') {
          const tool = data['tool'] as string
          setToolActivities((prev) => {
            // Avoid duplicates if Gemini retries the same call
            if (prev.some((t) => t.tool === tool && t.status === 'running')) return prev
            return [...prev, { tool, status: 'running' }]
          })
          // Delegation tools shift state to 'delegating'
          if (tool === 'delegate_to_agent') setState('delegating')
          return
        }

        if (msgType === 'tool_result') {
          const tool = data['tool'] as string
          setToolActivities((prev) =>
            prev.map((t) => t.tool === tool && t.status === 'running' ? { ...t, status: 'completed' } : t)
          )
          if (stateRef.current === 'delegating') setState('thinking')
          return
        }

        // ── Gemini Live protocol events (proxied from backend) ──────────────

        if ('setupComplete' in data) {
          // Backend already handled this — should not reach client, but guard anyway
          return
        }

        if ('sessionResumptionUpdate' in data) return

        const serverContent = data['serverContent'] as Record<string, unknown> | undefined
        if (serverContent) {
          // Gemini interrupted itself (e.g. user spoke mid-response)
          if (serverContent['interrupted']) {
            stopAudioPlayback()
            setState('listening')
            return
          }

          // User's transcribed speech
          const inputTranscript = serverContent['inputTranscript'] as string | undefined
          if (inputTranscript?.trim()) {
            onTranscript?.(inputTranscript, true)
            // Gemini is processing — show thinking while we wait for audio
            setState('thinking')
          }

          // Aria's audio response
          const parts = (serverContent['modelTurn'] as Record<string, unknown> | undefined)
            ?.['parts'] as Array<Record<string, unknown>> | undefined

          if (parts) {
            // Collect any text parts to surface in the transcript
            const textParts = parts
              .filter((p) => typeof p['text'] === 'string' && (p['text'] as string).trim())
              .map((p) => p['text'] as string)
            if (textParts.length > 0) {
              onAriaResponse?.(textParts.join(''))
            }

            // Play any audio parts
            for (const part of parts) {
              if (part['inlineData']) {
                const audioData = part['inlineData'] as Record<string, unknown>
                await playAudio(audioData['data'] as string)
                setState('speaking')
              }
            }
          }

          if (serverContent['turnComplete']) {
            // Clear completed tool badges after each turn
            setToolActivities((prev) => prev.filter((t) => t.status === 'running'))
            // Only reset the playback head if audio has already finished playing.
            // If we reset while chunks are still queued the jitter-buffer logic in
            // playAudio handles the "fresh start" case via the > now - 0.05 guard.
            const ctx = playbackCtxRef.current
            if (!ctx || nextPlayTimeRef.current <= ctx.currentTime) {
              nextPlayTimeRef.current = 0
            }

            if (stateRef.current === 'speaking' || stateRef.current === 'thinking') {
              setState('listening')
            }
          }
        }
      }

      ws.onerror = () => {
        setState('error')
        onError?.('WebSocket error')
      }

      ws.onclose = (event) => {
        setIsConnected(false)
        if (heartbeatTimerRef.current) { clearInterval(heartbeatTimerRef.current); heartbeatTimerRef.current = null }
        if (event.code === 1000) {
          setState('idle')
          cleanup()
          return
        }
        // Exponential back-off reconnect
        const delay = reconnectDelayRef.current
        reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY)
        setState('connecting')
        cleanup()
        setTimeout(() => {
          if (wsRef.current === ws || !wsRef.current) void connect()
        }, delay)
      }
    } catch (err) {
      setState('error')
      onError?.(err instanceof Error ? err.message : 'Connection failed')
    }
  }, [sessionId, onTranscript, onAriaResponse, onError, setState, playAudio, stopAudioPlayback, cleanup, sendScreenFrame])

  const disconnect = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(1000); wsRef.current = null }
    cleanup()
    setIsConnected(false)
    setState('idle')
  }, [cleanup, setState])

  // ── Mic — AudioWorklet (primary) with ScriptProcessor fallback ────────────
  //
  // AudioWorkletNode runs on a dedicated audio thread. React re-renders and
  // heavy main-thread work cannot delay or drop audio callbacks.
  //
  // Fallback to ScriptProcessorNode when AudioWorklet is unavailable
  // (very old browsers, restricted iframe contexts).

  const toggleMic = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    if (isMicOn) {
      stopMicCapture()
      setIsMicOn(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Request 16 kHz to match Gemini Live input format. The AudioContext
        // below will resample if the hardware doesn't support this natively.
        audio: { sampleRate: MIC_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      micStreamRef.current = stream
      stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        setIsMicOn(false)
        stopMicCapture()
      })

      // AudioContext at MIC_RATE ensures the browser resamples hardware audio
      // (often 44.1/48 kHz) down to 16 kHz before we read it.
      const ctx = new AudioContext({ sampleRate: MIC_RATE })
      micCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)

      // ── Shared per-frame send logic ──────────────────────────────────────
      const sendAudioPcm = (pcm: Int16Array, rms: number): void => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        // Backpressure: drop frame if the WS send buffer is building up.
        if (wsRef.current.bufferedAmount > BACKPRESSURE_LIMIT) return

        // VAD — interrupt playback when user speaks while Aria is talking.
        // Uses RMS (root mean square) to avoid false triggers from brief noise transients.
        if (stateRef.current === 'speaking' && rms > VAD_RMS_THRESHOLD) {
          stopAudioPlayback()
        }

        const bytes = new Uint8Array(pcm.buffer)
        let binary = ''
        for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]!)

        wsRef.current.send(JSON.stringify({
          realtimeInput: { audio: { mimeType: `audio/pcm;rate=${MIC_RATE}`, data: btoa(binary) } },
        }))
      }

      // ── Try AudioWorklet first ───────────────────────────────────────────
      let useWorklet = false
      try {
        await ctx.audioWorklet.addModule('/audio-capture-worklet.js')
        const workletNode = new AudioWorkletNode(ctx, 'audio-capture')
        workletNodeRef.current = workletNode

        workletNode.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
          sendAudioPcm(new Int16Array(e.data.pcm), e.data.rms)
        }

        source.connect(workletNode)
        // Do NOT connect workletNode to ctx.destination — we don't want mic echo
        useWorklet = true
      } catch (workletErr) {
        console.warn('[AriaLive] AudioWorklet unavailable, falling back to ScriptProcessor:', workletErr)
      }

      // ── ScriptProcessor fallback ─────────────────────────────────────────
      if (!useWorklet) {
        const processor = ctx.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0)

          // Compute RMS for VAD
          let sumSq = 0
          for (let i = 0; i < inputData.length; i++) {
            const s = inputData[i] ?? 0
            sumSq += s * s
          }
          const rms = Math.sqrt(sumSq / inputData.length)

          // Convert Float32 → Int16
          const pcm = new Int16Array(inputData.length)
          for (let i = 0; i < inputData.length; i++) {
            pcm[i] = Math.max(-32768, Math.min(32767, Math.floor((inputData[i] ?? 0) * 32768)))
          }

          sendAudioPcm(pcm, rms)
        }

        source.connect(processor)
        processor.connect(ctx.destination)
      }

      setIsMicOn(true)
      setState('listening')
    } catch (err) {
      onError?.(`Microphone access denied: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [isMicOn, onError, setState, stopAudioPlayback, stopMicCapture])

  // ── Camera ────────────────────────────────────────────────────────────────

  const toggleCamera = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    if (isCameraOn) {
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop())
      cameraStreamRef.current = null
      setIsCameraOn(false)
      return
    }
    try {
      cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: true })
      setIsCameraOn(true)
    } catch (err) {
      onError?.(`Camera access denied: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [isCameraOn, onError])

  // ── Screen share + frame capture ──────────────────────────────────────────

  const startScreenShare = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 5, max: 10 } },
      })
      screenStreamRef.current = stream
      setIsScreenSharing(true)

      // Clean up automatically when the user stops sharing via browser UI
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        setIsScreenSharing(false)
        screenStreamRef.current = null
        if (screenFrameTimerRef.current) { clearInterval(screenFrameTimerRef.current); screenFrameTimerRef.current = null }
      })

      // Start periodic frame capture
      screenFrameTimerRef.current = setInterval(sendScreenFrame, SCREEN_FRAME_INTERVAL)
      // Send the first frame immediately so Gemini has context right away
      sendScreenFrame()
    } catch (err) {
      onError?.(`Screen share denied: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [onError, sendScreenFrame])

  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop())
    screenStreamRef.current = null
    if (screenFrameTimerRef.current) { clearInterval(screenFrameTimerRef.current); screenFrameTimerRef.current = null }
    screenCanvasRef.current = null
    if (screenVideoRef.current) { screenVideoRef.current.srcObject = null; screenVideoRef.current = null }
    setIsScreenSharing(false)
  }, [])

  // ── Text input — sent as a turn directly to Gemini via the proxy ──────────

  const sendText = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    onTranscript?.(text, true)
    wsRef.current.send(JSON.stringify({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    }))
    setState('thinking')
  }, [onTranscript, setState])

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
