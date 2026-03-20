'use client'

import { useState, useCallback, useRef } from 'react'
import { Mic, MicOff } from 'lucide-react'

// Web Speech API types are not in default lib — declare minimal interface
interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly [index: number]: { readonly transcript: string } | undefined
}

interface SpeechRecognitionEvent {
  readonly resultIndex: number
  readonly results: {
    readonly length: number
    readonly [index: number]: SpeechRecognitionResult | undefined
  }
}

interface SpeechRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

interface VoiceInputProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

export function VoiceInput({ onTranscript, disabled }: VoiceInputProps) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const toggle = useCallback(() => {
    const win = window as unknown as Record<string, unknown>
    const SpeechRecognitionCtor = win['SpeechRecognition'] ?? win['webkitSpeechRecognition']

    if (!SpeechRecognitionCtor) {
      alert('Speech recognition is not supported in this browser.')
      return
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop()
      setListening(false)
      return
    }

    const recognition = new (SpeechRecognitionCtor as new () => SpeechRecognitionInstance)()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    let finalTranscript = ''

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result?.[0]) {
          if (result.isFinal) {
            finalTranscript += result[0].transcript + ' '
          } else {
            interim += result[0].transcript
          }
        }
      }
      // Fill input but do NOT auto-send
      onTranscript(finalTranscript + interim)
    }

    recognition.onerror = () => {
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
      if (finalTranscript.trim()) {
        onTranscript(finalTranscript.trim())
      }
    }

    recognition.start()
    recognitionRef.current = recognition
    setListening(true)
  }, [listening, onTranscript])

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      className={`p-2 rounded-lg transition-colors ${
        listening
          ? 'bg-[var(--error)]/20 text-[var(--error)] animate-pulse'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
      }`}
      title={listening ? 'Stop recording' : 'Start voice input'}
    >
      {listening ? <MicOff size={18} /> : <Mic size={18} />}
    </button>
  )
}
