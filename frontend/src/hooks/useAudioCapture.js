import { useRef, useCallback } from 'react'

const CHUNK_MS = 3000         // 3 seconds (faster feedback)
const OVERLAP_MS = 800        // 800ms overlap
const SAMPLE_RATE = 16000    // 16 kHz mono for Whisper

/**
 * Deduplication: strip leading tokens that were already in the previous chunk's tail
 */
function deduplicateTokens(prevTail, newText) {
  if (!prevTail || !newText) return newText
  const prevWords = prevTail.trim().split(/\s+/)
  const newWords  = newText.trim().split(/\s+/)

  // Find longest suffix of prevWords that is a prefix of newWords
  let overlap = 0
  for (let len = Math.min(prevWords.length, newWords.length, 20); len > 0; len--) {
    const prevSuffix = prevWords.slice(-len).join(' ').toLowerCase()
    const newPrefix  = newWords.slice(0, len).join(' ').toLowerCase()
    if (prevSuffix === newPrefix) { overlap = len; break }
  }

  return newWords.slice(overlap).join(' ')
}

export default function useAudioCapture(onChunk) {
  const streamRef      = useRef(null)
  const recorderRef    = useRef(null)
  const chunksRef      = useRef([])
  const timerRef       = useRef(null)
  const prevTailRef    = useRef('')
  const sessionIdRef   = useRef(null)
  const activeRef      = useRef(false)

  const encodeWav = useCallback((float32Array, sampleRate) => {
    const buffer = new ArrayBuffer(44 + float32Array.length * 2)
    const view   = new DataView(buffer)

    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
    }
    writeStr(0,  'RIFF')
    view.setUint32(4,  36 + float32Array.length * 2, true)
    writeStr(8,  'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16,         true)  // chunk size
    view.setUint16(20, 1,          true)  // PCM
    view.setUint16(22, 1,          true)  // mono
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2,true)
    view.setUint16(32, 2,          true)
    view.setUint16(34, 16,         true)
    writeStr(36, 'data')
    view.setUint32(40, float32Array.length * 2, true)
    
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]))
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    }
    return new Uint8Array(buffer)
  }, [])

  const sendChunkFromBuffer = useCallback(async (audioContext, audioChunks) => {
    if (!audioChunks.length) return

    // Flatten
    const totalLen = audioChunks.reduce((sum, c) => sum + c.length, 0)
    const combined = new Float32Array(totalLen)
    let offset = 0
    for (const c of audioChunks) { combined.set(c, offset); offset += c.length }

    const wav = encodeWav(combined, SAMPLE_RATE)
    const blob = new Blob([wav], { type: 'audio/wav' })
    
    // Asynchronously encode to base64 via FileReader (much more memory efficient)
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64data = reader.result.split(',')[1]
      onChunk({
        session_id: sessionIdRef.current,
        audio_b64:  base64data,
        sample_rate: SAMPLE_RATE,
        timestamp:  new Date().toISOString()
      })
    }
    reader.readAsDataURL(blob)
  }, [encodeWav, onChunk])

  const startCapture = useCallback(async (source) => {
    try {
      activeRef.current = true
      sessionIdRef.current = `sess_${Date.now()}`
      prevTailRef.current = ''

      // 1. Create AudioContext IMMEDIATELY while the user gesture is 100% active.
      // If we wait for the permission popup (which can take seconds), Chrome will
      // revoke the user gesture token and permanently suspend the audio engine!
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE })
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume()
      }

      let mediaStream

      if (source.type === 'mic') {
        // Standard microphone capture — works in both Electron and browser
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate:       SAMPLE_RATE,
            channelCount:     1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl:  true
          }
        })
      } else {
        // System / app capture via Electron desktopCapturer
        // In plain browser mode, fall back to mic (desktop capturer requires Electron IPC)
        if (window.samvaad?.getSources) {
          try {
            const streamId = source.id
            mediaStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                mandatory: {
                  chromeMediaSource:   'desktop',
                  chromeMediaSourceId: streamId
                }
              },
              video: false
            })
          } catch (_) {
            // Fall back to mic in browser context
            console.warn('[Audio] Desktop capture unavailable in browser, falling back to mic')
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          }
        } else {
          // Pure browser mode — use getDisplayMedia for system/tab capture
          console.info('[Audio] Browser mode: using getDisplayMedia for system audio')
          mediaStream = await navigator.mediaDevices.getDisplayMedia({
            video: true, // Most browsers require video: true to prompt for screen/tab sharing
            audio: true
          })
        }
      }

      streamRef.current = mediaStream

      const sourceNode = audioCtx.createMediaStreamSource(mediaStream)
      const processor  = audioCtx.createScriptProcessor(4096, 1, 1)

      const pcmChunks = []
      let chunkStart  = Date.now()
      let processCount = 0

      processor.onaudioprocess = (e) => {
        if (!activeRef.current) return
        processCount++
        
        const input = e.inputBuffer.getChannelData(0)
        
        // Calculate raw volume for UI feedback
        let sum = 0
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
        const rms = Math.sqrt(sum / input.length)
        if (processCount % 5 === 0) {
            window.dispatchEvent(new CustomEvent('mic-volume', { detail: rms }))
        }

        pcmChunks.push(new Float32Array(input))

        const elapsed = Date.now() - chunkStart
        if (elapsed >= CHUNK_MS) {
          console.log(`[Audio] Sending chunk after ${elapsed}ms`)
          sendChunkFromBuffer(audioCtx, [...pcmChunks])
          // Keep last OVERLAP_MS of audio for deduplication
          const overlapSamples = Math.floor(SAMPLE_RATE * OVERLAP_MS / 1000)
          const lastChunk = pcmChunks[pcmChunks.length - 1]
          pcmChunks.length = 0
          if (lastChunk) pcmChunks.push(lastChunk.slice(-overlapSamples))
          chunkStart = Date.now()
        }
      }

      sourceNode.connect(processor)
      processor.connect(audioCtx.destination)
      recorderRef.current = { audioCtx, sourceNode, processor }

    } catch (err) {
      activeRef.current = false
      // Rethrow with cleaner message so App.jsx can display it
      throw err
    }
  }, [sendChunkFromBuffer])

  const stopCapture = useCallback(async () => {
    activeRef.current = false
    clearInterval(timerRef.current)

    if (recorderRef.current) {
      const { audioCtx, sourceNode, processor } = recorderRef.current
      sourceNode.disconnect()
      processor.disconnect()
      await audioCtx.close()
      recorderRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  return { startCapture, stopCapture }
}
