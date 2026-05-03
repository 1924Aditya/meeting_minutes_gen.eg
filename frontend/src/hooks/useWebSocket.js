import { useState, useEffect, useRef, useCallback } from 'react'

const RECONNECT_INTERVAL = 3000
const MAX_RECONNECT = 10

export default function useWebSocket(url) {
  const [transcriptSegments, setTranscriptSegments] = useState([])
  const [summary, setSummary] = useState(null)
  const [speakers, setSpeakers] = useState({})   // { speaker_id: name }
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const wsRef = useRef(null)
  const reconnectCountRef = useRef(0)
  const reconnectTimerRef = useRef(null)

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setConnectionStatus('connected')
        reconnectCountRef.current = 0
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          console.log('[WS] Received message:', msg)
          handleMessage(msg)
        } catch (e) {
          console.error('WS parse error:', e)
        }
      }

      ws.onclose = () => {
        setConnectionStatus('disconnected')
        scheduleReconnect()
      }

      ws.onerror = () => {
        setConnectionStatus('error')
      }
    } catch (e) {
      setConnectionStatus('error')
      scheduleReconnect()
    }
  }, [url])

  const scheduleReconnect = useCallback(() => {
    if (reconnectCountRef.current >= MAX_RECONNECT) return
    reconnectCountRef.current += 1
    setConnectionStatus('connecting')
    reconnectTimerRef.current = setTimeout(() => connect(), RECONNECT_INTERVAL)
  }, [connect])

  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'TRANSCRIPT_UPDATE':
        setTranscriptSegments(prev => {
          // Dedup by id
          if (msg.id && prev.some(s => s.id === msg.id)) return prev
          
          const now = Date.now()
          const newMsg = { ...msg, internalStart: now, internalLastUpdate: now }

          if (prev.length > 0) {
            const last = prev[prev.length - 1]
            const lastUpdate = last.internalLastUpdate || (last.timestamp ? new Date(last.timestamp).getTime() : now)
            const lastStart  = last.internalStart || (last.timestamp ? new Date(last.timestamp).getTime() : now)
            
            const timeSinceLast = now - lastUpdate
            const segmentDuration = now - lastStart

            // SEMANTIC PARAGRAPHING RULES (YouTube Style):
            // 1. Same speaker (voice signature must match)
            // 2. No very long pause (gap > 8 seconds)
            // 3. Segment duration under 60 seconds
            if (
              last.speaker_id === msg.speaker_id &&
              timeSinceLast < 8000 &&
              segmentDuration < 60000
            ) {
              const prevText = last.text.trim()
              const newText = msg.text.trim()
              
              const prevWords = prevText.split(/\s+/)
              const newWords = newText.split(/\s+/)
              
              let overlap = 0
              for (let len = Math.min(prevWords.length, newWords.length, 20); len > 0; len--) {
                // Strip punctuation for comparison
                const stripPunc = s => s.replace(/[.,!?]/g, '').toLowerCase()
                const prevSuffix = stripPunc(prevWords.slice(-len).join(' '))
                const newPrefix = stripPunc(newWords.slice(0, len).join(' '))
                if (prevSuffix === newPrefix) { overlap = len; break }
              }
              
              const cleanNewText = newWords.slice(overlap).join(' ')
              if (!cleanNewText) return prev // Nothing new to add
              
              const updatedLast = {
                ...last,
                text: prevText + (cleanNewText ? ' ' + cleanNewText : ''),
                internalLastUpdate: now,
                internalStart: lastStart
              }
              
              return [...prev.slice(0, -1), updatedLast]
            }
          }
          
          return [...prev, newMsg]
        })
        // Auto-register speaker
        if (msg.speaker_id) {
          setSpeakers(prev => {
            if (!prev[msg.speaker_id]) {
              return { ...prev, [msg.speaker_id]: msg.speaker_name || msg.speaker_id }
            }
            return prev
          })
        }
        break

      case 'SUMMARY_UPDATE':
        setSummary(msg)
        break

      case 'SPEAKER_SUGGEST':
        // Dispatch as custom event so App.jsx can show modal
        window.dispatchEvent(new CustomEvent('speaker-suggest', { detail: msg }))
        break

      case 'SPEAKER_MAP':
        setSpeakers(msg.map)
        break

      case 'SESSION_STATE':
        // Restore session on reconnect
        if (msg.segments) setTranscriptSegments(msg.segments)
        if (msg.summary)  setSummary(msg.summary)
        if (msg.speakers) setSpeakers(msg.speakers)
        break

      case 'ERROR':
        console.error('AI service error:', msg.code, msg.message)
        break

      default:
        break
    }
  }, [])

  useEffect(() => {
    setConnectionStatus('connecting')
    connect()
    return () => {
      clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  const sendChunk = useCallback((chunkData) => {
    console.log('[useWebSocket] sendChunk called, state:', wsRef.current?.readyState)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'AUDIO_CHUNK', ...chunkData }))
    }
  }, [])

  const updateSpeakerName = useCallback((speakerId, name) => {
    setSpeakers(prev => ({ ...prev, [speakerId]: name }))
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'UPDATE_SPEAKER',
        speaker_id: speakerId,
        name
      }))
    }
  }, [])

  const clearSession = useCallback(() => {
    setTranscriptSegments([])
    setSummary(null)
    setSpeakers({})
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'CLEAR_SESSION' }))
    }
  }, [])

  const sendSessionControl = useCallback((action) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SESSION_CONTROL', action }))
    }
  }, [])

  return {
    transcriptSegments,
    summary,
    speakers,
    connectionStatus,
    sendChunk,
    updateSpeakerName,
    clearSession,
    sendSessionControl
  }
}
