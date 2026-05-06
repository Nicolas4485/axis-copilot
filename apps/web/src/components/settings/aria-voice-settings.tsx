'use client'

// AriaVoiceSettings — pick and persist Aria's voice.
//
// UX contract:
//   ▶  Preview button → plays a sample using the ACTUAL Gemini voice via Web Audio API.
//                       Does NOT save anything.
//   ✓  Select button  → saves the voice to the user profile.
//   The saved voice NEVER changes unless the user explicitly hits Select.

import { useState, useEffect, useRef, useCallback } from 'react'
import { userProfile, type GeminiVoice } from '@/lib/api'
import { Check, Loader2, Play, Square, Volume2 } from 'lucide-react'

const VOICE_DESCRIPTIONS: Record<GeminiVoice, { character: string; gender: string }> = {
  Aoede:  { character: 'Calm, warm, clear',      gender: 'Female' },
  Puck:   { character: 'Bright, energetic',       gender: 'Male'   },
  Charon: { character: 'Deep, authoritative',     gender: 'Male'   },
  Kore:   { character: 'Soft, precise',           gender: 'Female' },
  Fenrir: { character: 'Bold, confident',         gender: 'Male'   },
  Leda:   { character: 'Smooth, professional',    gender: 'Female' },
  Orus:   { character: 'Natural, conversational', gender: 'Male'   },
  Zephyr: { character: 'Light, friendly',         gender: 'Female' },
}

/**
 * Decode raw 16-bit signed little-endian PCM and play it through the Web Audio API.
 * Returns a stop function and a Promise that resolves when playback ends.
 */
function playPcm(
  audioBase64: string,
  sampleRate: number,
  onEnded: () => void,
): { stop: () => void } {
  const ctx = new AudioContext({ sampleRate })

  // Base64 → Uint8Array → Int16Array (LE signed)
  const binaryStr = atob(audioBase64)
  const bytes     = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

  const samples    = new Int16Array(bytes.buffer)
  const floats     = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    floats[i] = (samples[i] ?? 0) / 32768
  }

  const buffer = ctx.createBuffer(1, floats.length, sampleRate)
  buffer.getChannelData(0).set(floats)

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.onended = () => {
    void ctx.close()
    onEnded()
  }
  source.start()

  return {
    stop: () => {
      try { source.stop() } catch { /* already stopped */ }
      void ctx.close()
      onEnded()
    },
  }
}

export function AriaVoiceSettings() {
  const [savedVoice, setSavedVoice]     = useState<GeminiVoice>('Aoede')
  const [saving, setSaving]             = useState(false)
  const [savedFlash, setSavedFlash]     = useState(false)
  const [loading, setLoading]           = useState(true)
  const [saveError, setSaveError]       = useState<string | null>(null)

  // Preview state — only one voice previews at a time
  const [playingVoice, setPlayingVoice] = useState<GeminiVoice | null>(null)
  const [loadingVoice, setLoadingVoice] = useState<GeminiVoice | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    userProfile.get()
      .then(({ user }) => { setSavedVoice(user.voiceName); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const stopCurrent = useCallback(() => {
    stopRef.current?.()
    stopRef.current = null
    setPlayingVoice(null)
  }, [])

  useEffect(() => () => stopCurrent(), [stopCurrent])

  const handlePreview = useCallback(async (voice: GeminiVoice) => {
    if (playingVoice === voice) { stopCurrent(); return }
    stopCurrent()
    setPreviewError(null)
    setLoadingVoice(voice)

    try {
      const { audioBase64, sampleRate } = await userProfile.voicePreview(voice)
      const { stop } = playPcm(audioBase64, sampleRate, () => setPlayingVoice(null))
      stopRef.current = stop
      setPlayingVoice(voice)
    } catch (err) {
      // Gemini TTS unavailable — fall back to browser's built-in speech synthesis
      // so the user can still audition the character description at minimum
      const message = err instanceof Error ? err.message : 'Preview failed'
      console.warn('[VoicePreview] Gemini TTS failed, trying browser speech:', message)

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const SAMPLE = "Hello! I'm Aria, your AI consulting co-pilot."
        const utt = new SpeechSynthesisUtterance(SAMPLE)
        utt.rate = 0.95
        utt.onend = () => setPlayingVoice(null)
        utt.onerror = () => {
          setPlayingVoice(null)
          setPreviewError(`Gemini TTS unavailable: ${message}`)
        }
        window.speechSynthesis.speak(utt)
        stopRef.current = () => {
          window.speechSynthesis.cancel()
          setPlayingVoice(null)
        }
        setPlayingVoice(voice)
        setPreviewError('Using browser voice (Gemini TTS unavailable)')
      } else {
        setPreviewError(`Preview unavailable: ${message}`)
      }
    } finally {
      setLoadingVoice(null)
    }
  }, [playingVoice, stopCurrent])

  const handleSelect = useCallback(async (voice: GeminiVoice) => {
    if (voice === savedVoice || saving) return
    stopCurrent()
    setSaving(true)
    setSavedFlash(false)
    setSaveError(null)
    try {
      const { user } = await userProfile.update({ voiceName: voice })
      setSavedVoice(user.voiceName)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
    } catch {
      setSaveError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [savedVoice, saving, stopCurrent])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={14} className="animate-spin" />
        Loading preferences…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(VOICE_DESCRIPTIONS) as GeminiVoice[]).map((voice) => {
          const { character, gender } = VOICE_DESCRIPTIONS[voice]
          const isSelected = savedVoice === voice
          const isPlaying  = playingVoice === voice
          const isLoading  = loadingVoice === voice

          return (
            <div
              key={voice}
              className="rounded-xl p-3.5 transition-all duration-150"
              style={{
                background: isSelected ? 'rgba(200,121,65,0.07)' : 'var(--bg-secondary)',
                border: isSelected ? '1.5px solid var(--gold)' : '1px solid var(--border)',
              }}
            >
              {/* Name row */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-semibold"
                    style={{
                      color: isSelected ? 'var(--gold)' : 'var(--text-primary)',
                      fontFamily: 'var(--font-inter)',
                    }}
                  >
                    {voice}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}
                  >
                    {gender}
                  </span>
                </div>
                {isSelected && (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'var(--gold)' }}
                  >
                    <Check size={11} color="#000" strokeWidth={3} />
                  </div>
                )}
              </div>

              {/* Character description */}
              <p className="text-xs mb-3 leading-snug" style={{ color: 'var(--text-muted)' }}>
                {character}
              </p>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                {/* Preview / stop */}
                <button
                  onClick={() => void handlePreview(voice)}
                  disabled={saving || (loadingVoice !== null && !isLoading)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs
                             font-medium transition-all duration-150 disabled:opacity-40"
                  style={{
                    background: isPlaying ? 'rgba(200,121,65,0.15)' : 'rgba(255,255,255,0.06)',
                    color: isPlaying ? 'var(--gold)' : 'var(--text-secondary)',
                    border: isPlaying
                      ? '1px solid rgba(200,121,65,0.4)'
                      : '1px solid rgba(255,255,255,0.08)',
                    fontFamily: 'var(--font-inter)',
                  }}
                >
                  {isLoading
                    ? <Loader2 size={11} className="animate-spin" />
                    : isPlaying
                      ? <Square size={10} />
                      : <Play size={10} />
                  }
                  {isLoading ? 'Loading…' : isPlaying ? 'Stop' : 'Preview'}
                </button>

                {/* Select — only for non-saved voices */}
                {!isSelected && (
                  <button
                    onClick={() => void handleSelect(voice)}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs
                               font-medium transition-all duration-150 disabled:opacity-40"
                    style={{
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      fontFamily: 'var(--font-inter)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--gold)'
                      e.currentTarget.style.borderColor = 'rgba(200,121,65,0.5)'
                      e.currentTarget.style.background = 'rgba(200,121,65,0.06)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-secondary)'
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {saving
                      ? <Loader2 size={10} className="animate-spin" />
                      : <Volume2 size={10} />
                    }
                    {saving ? 'Saving…' : 'Select'}
                  </button>
                )}

                {isSelected && (
                  <span className="text-[11px] font-medium" style={{ color: 'var(--gold)' }}>
                    Current voice
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Feedback */}
      {previewError && (
        <p
          className="text-xs"
          style={{
            color: previewError.startsWith('Using browser voice')
              ? 'var(--warning)'
              : 'var(--error)',
          }}
        >
          {previewError}
        </p>
      )}
      {saveError && (
        <p className="text-xs" style={{ color: 'var(--error)' }}>{saveError}</p>
      )}
      {savedFlash && (
        <div className="flex items-center gap-2 text-sm animate-fade-in" style={{ color: 'var(--success)' }}>
          <Check size={14} />
          Voice saved — takes effect on your next live session.
        </div>
      )}

      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Use <strong style={{ color: 'var(--text-secondary)' }}>Preview</strong> to hear the actual Gemini voice.
        Hit <strong style={{ color: 'var(--text-secondary)' }}>Select</strong> to save — your voice only
        changes when you explicitly select a new one.
      </p>
    </div>
  )
}
