import { useRef, useCallback } from 'react'

/**
 * useSpeechCapture — uses the browser's built-in Web Speech API (SpeechRecognition)
 * for real-time transcription. Works in Chrome without any server-side Whisper.
 * Falls back gracefully if the browser does not support it.
 *
 * @param {Function} onTranscript - called with { text, isFinal, timestamp }
 */
export default function useSpeechCapture(onTranscript) {
  const recognitionRef = useRef(null)
  const activeRef      = useRef(false)
  const speakerIdRef   = useRef('Spk_0')

  const startCapture = useCallback(async (source) => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      throw new Error(
        'Your browser does not support the Web Speech API. Please use Chrome.'
      )
    }

    // Request mic permission first (also unlocks AudioContext for good measure)
    await navigator.mediaDevices.getUserMedia({ audio: true })

    activeRef.current = true
    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition

    recognition.continuous    = true
    recognition.interimResults = true
    recognition.lang          = 'en-US'
    recognition.maxAlternatives = 1

    let lastFinalText = ''

    recognition.onresult = (event) => {
      if (!activeRef.current) return

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text   = result[0].transcript.trim()

        if (result.isFinal && text && text !== lastFinalText) {
          lastFinalText = text
          speakerIdRef.current = 'Spk_0'  // single speaker in browser mode
          onTranscript({
            text,
            isFinal:    true,
            speaker_id: speakerIdRef.current,
            timestamp:  new Date().toISOString()
          })
        }
      }
    }

    recognition.onerror = (e) => {
      if (e.error === 'no-speech') return // normal, ignore
      console.warn('[SpeechCapture] Error:', e.error)
    }

    recognition.onend = () => {
      // Auto-restart unless manually stopped (handles Chrome's 60s timeout)
      if (activeRef.current) {
        try { recognition.start() } catch (_) {}
      }
    }

    recognition.start()
  }, [onTranscript])

  const stopCapture = useCallback(async () => {
    activeRef.current = false
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (_) {}
      recognitionRef.current = null
    }
  }, [])

  return { startCapture, stopCapture }
}
