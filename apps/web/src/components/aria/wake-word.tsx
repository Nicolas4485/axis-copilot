'use client'

// WakeWord — listens for "Hey Aria" or "Hi Aria" and navigates to a live session
// Runs globally across all pages via the root layout

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export function WakeWordListener() {
  const router = useRouter()
  const pathname = usePathname()
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<unknown>(null)

  useEffect(() => {
    // Don't run on session pages (Aria is already active there)
    if (pathname.startsWith('/session/')) return

    // Check if Web Speech API is available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionCtor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
    const recognition = new SpeechRecognitionCtor() as any
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = (event.results[i]?.[0]?.transcript ?? '').toLowerCase()
        if (
          transcript.includes('hey aria') ||
          transcript.includes('hi aria') ||
          transcript.includes('hello aria')
        ) {
          console.log('[WakeWord] Detected:', transcript)
          recognition.stop()
          router.push('/session/new?live=true&automic=true')
          return
        }
      }
    }

    recognition.onend = () => {
      // Restart listening (browser stops after silence)
      if (listening) {
        try { recognition.start() } catch { /* already running */ }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('[WakeWord] Error:', event.error)
      }
    }

    try {
      recognition.start()
      setListening(true)
    } catch {
      // Permission denied or not supported
    }

    return () => {
      setListening(false)
      try { recognition.stop() } catch { /* ignore */ }
    }
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // No visible UI — background listener
  return null
}
