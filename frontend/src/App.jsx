import React, { useState, useEffect, useCallback, useRef } from 'react'
import TopBar from './components/TopBar'
import TranscriptPanel from './components/TranscriptPanel'
import SummaryPanel from './components/SummaryPanel'
import SpeakerMapModal from './components/SpeakerMapModal'
import ExportModal from './components/ExportModal'
import FirstRunScreen from './components/FirstRunScreen'
import useWebSocket from './hooks/useWebSocket'
import useAudioCapture from './hooks/useAudioCapture'
import './styles/app.css'

export default function App() {
  const [isFirstRun, setIsFirstRun] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [selectedSource, setSelectedSource] = useState(null)
  const [showSpeakerModal, setShowSpeakerModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportMode, setExportMode] = useState('all')
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
    updateSpeakerName,
    clearSession,
    sendSessionControl
  } = useWebSocket('ws://127.0.0.1:3001/ws')

  const { startCapture, stopCapture } = useAudioCapture(sendChunk)

  // Check first run
  useEffect(() => {
    const checkFirstRun = async () => {
      if (window.samvaad) {
        const firstRun = await window.samvaad.isFirstRun()
        setIsFirstRun(firstRun)
      } else {
        // If not in electron, assume first run so models initialize correctly
        setIsFirstRun(true)
      }
    }
    checkFirstRun()
  }, [])

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
      if (!selectedSource) {
        setCaptureError('Please select an audio source first.')
        return
      }
      try {
        await startCapture(selectedSource)
        sendSessionControl('start')
        setIsRecording(true)
        console.log('[App] Session started successfully')
      } catch (err) {
        console.error('Audio capture failed:', err)
        const msg = err?.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please allow access in Windows Settings and try again.'
          : err?.name === 'NotFoundError'
          ? 'Selected audio device not found. Please refresh sources.'
          : `System error: ${err?.message || 'Could not start audio engine'}`
        setCaptureError(msg)
        setIsRecording(false)
      }
    }
  }, [isRecording, selectedSource, startCapture, stopCapture, sendSessionControl])

  const handleSpeakerUpdate = useCallback((speakerId, name) => {
    updateSpeakerName(speakerId, name)
  }, [updateSpeakerName])

  const handleFirstRunComplete = () => {
    setIsFirstRun(false)
  }

  if (isFirstRun) {
    return <FirstRunScreen onComplete={handleFirstRunComplete} />
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
