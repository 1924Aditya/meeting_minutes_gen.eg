import React, { useState, useEffect, useCallback, useRef } from 'react'
import TopBar from './components/TopBar'
import TranscriptPanel from './components/TranscriptPanel'
import SummaryPanel from './components/SummaryPanel'
import SpeakerMapModal from './components/SpeakerMapModal'
import ExportModal from './components/ExportModal'
import ApiKeySetup from './components/ApiKeySetup'
import useWebSocket from './hooks/useWebSocket'
import useAudioCapture from './hooks/useAudioCapture'
import useSpeechCapture from './hooks/useSpeechCapture'
import './styles/app.css'

// Determine backend WebSocket URL:
// - In production (Vercel), use the env variable set at build time
// - In local dev, use localhost
const WS_URL = import.meta.env.VITE_BACKEND_WS_URL || 'ws://127.0.0.1:3001/ws'

// Detect if we're running in a browser (not Electron) — cloud mode
const IS_BROWSER_MODE = !window.samvaad

export default function App() {
  const [geminiKey, setGeminiKey]       = useState(() => localStorage.getItem('samvaad_gemini_key') || null)
  const [isRecording, setIsRecording]   = useState(false)
  const [selectedSource, setSelectedSource] = useState(null)
  const [showSpeakerModal, setShowSpeakerModal] = useState(false)
  const [showExportModal, setShowExportModal]   = useState(false)
  const [exportMode, setExportMode]     = useState('all')
  const [speakerSuggestion, setSpeakerSuggestion] = useState(null)
  const [sessionTimer, setSessionTimer] = useState(0)
  const [captureError, setCaptureError] = useState(null)
  const timerRef = useRef(null)

  const openExport = (mode = 'all') => {
    setExportMode(mode)
    setShowExportModal(true)
  }

  const {
    transcriptSegments,
    summary,
    speakers,
    connectionStatus,
    sendChunk,
    sendTranscript,
    updateSpeakerName,
    clearSession,
    sendSessionControl,
    setApiKey: setWsApiKey
  } = useWebSocket(WS_URL)

  // Pass API key to backend via WebSocket whenever it changes
  useEffect(() => {
    if (geminiKey) setWsApiKey(geminiKey)
  }, [geminiKey, setWsApiKey])

  // Capture methods:
  // - System / Tab audio always uses audioCapture (triggers getDisplayMedia Chrome tab picker)
  // - Microphone in browser mode uses speechCapture (Web Speech API)
  // - In Electron mode, always uses audioCapture
  const speechCapture = useSpeechCapture(sendTranscript)
  const audioCapture  = useAudioCapture(sendChunk)
  const isSystemAudio = selectedSource?.type === 'system'
  const { startCapture, stopCapture } = (!IS_BROWSER_MODE || isSystemAudio) ? audioCapture : speechCapture

  // Session timer
  useEffect(() => {
    if (isRecording) {
      setSessionTimer(0)
      timerRef.current = setInterval(() => setSessionTimer(t => t + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [isRecording])

  const handleStartStop = useCallback(async () => {
    setCaptureError(null)
    if (isRecording) {
      try { await stopCapture() } catch (_) {}
      sendSessionControl('stop')
      setIsRecording(false)
    } else {
      if (!IS_BROWSER_MODE && !selectedSource) {
        setCaptureError('Please select an audio source first.')
        return
      }
      try {
        await startCapture(selectedSource || { type: 'mic' })
        sendSessionControl('start')
        setIsRecording(true)
      } catch (err) {
        console.error('Audio capture failed:', err)
        const msg = err?.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please allow microphone access and try again.'
          : err?.name === 'NotFoundError'
          ? 'Microphone not found. Please check your audio device.'
          : `Error: ${err?.message || 'Could not start audio capture'}`
        setCaptureError(msg)
        setIsRecording(false)
      }
    }
  }, [isRecording, selectedSource, startCapture, stopCapture, sendSessionControl])

  const handleSpeakerUpdate = useCallback((speakerId, name) => {
    updateSpeakerName(speakerId, name)
  }, [updateSpeakerName])

  const handleClearKey = () => {
    localStorage.removeItem('samvaad_gemini_key')
    setGeminiKey(null)
  }

  // Show API key setup if no key stored (browser mode only)
  if (IS_BROWSER_MODE && !geminiKey) {
    return <ApiKeySetup onKeySubmit={(key) => setGeminiKey(key)} />
  }

  return (
    <div className="app-root">
      {/* Background decorations */}
      <div className="bg-grid" aria-hidden="true" />
      <div className="orb orb-1" aria-hidden="true" />
      <div className="orb orb-2" aria-hidden="true" />

      {/* App layout */}
      <div className="app-layout">
        <TopBar
          isRecording={isRecording}
          selectedSource={selectedSource}
          onSourceChange={(src) => { setSelectedSource(src); setCaptureError(null) }}
          onStartStop={handleStartStop}
          sessionTimer={sessionTimer}
          connectionStatus={connectionStatus}
          onOpenSpeakers={() => setShowSpeakerModal(true)}
          onOpenExport={() => openExport('all')}
          onClearSession={clearSession}
          isBrowserMode={IS_BROWSER_MODE}
          onClearApiKey={handleClearKey}
        />

        {captureError && (
          <div className="error-banner" style={{ margin: '0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            {captureError}
            <button className="btn btn-ghost btn-sm" style={{marginLeft:'auto',padding:'2px 8px'}} onClick={() => setCaptureError(null)}>✕</button>
          </div>
        )}

        <main className="main-content">
          <TranscriptPanel
            segments={transcriptSegments}
            speakers={speakers}
            isRecording={isRecording}
            onExport={() => openExport('transcript')}
          />
          <SummaryPanel
            summary={summary}
            isRecording={isRecording}
            onExport={() => openExport('summary')}
          />
        </main>
      </div>

      {/* Modals */}
      {showSpeakerModal && (
        <SpeakerMapModal
          speakers={speakers}
          suggestion={speakerSuggestion}
          onUpdate={handleSpeakerUpdate}
          onClose={() => { setShowSpeakerModal(false); setSpeakerSuggestion(null) }}
        />
      )}

      {showExportModal && (
        <ExportModal
          segments={transcriptSegments}
          summary={summary}
          speakers={speakers}
          mode={exportMode}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  )
}
