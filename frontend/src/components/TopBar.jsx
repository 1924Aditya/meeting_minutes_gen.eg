import React, { useState, useEffect, useRef } from 'react'
import './TopBar.css'

const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

const STATUS_COLORS = {
  connected:    'var(--success)',
  connecting:   'var(--warning)',
  disconnected: 'var(--danger)',
  error:        'var(--danger)'
}

export default function TopBar({
  isRecording, selectedSource, onSourceChange, onStartStop,
  sessionTimer, connectionStatus, onOpenSpeakers, onOpenExport, onClearSession
}) {
  const [micLevel, setMicLevel] = useState(0)
  const [sources, setSources] = useState([])
  const [loadingSources, setLoadingSources] = useState(false)

  useEffect(() => {
    const handleVolume = (e) => setMicLevel(e.detail)
    window.addEventListener('mic-volume', handleVolume)
    return () => window.removeEventListener('mic-volume', handleVolume)
  }, [])

  const fetchSources = async () => {
    setLoadingSources(true)
    try {
      let srcs = []
      if (window.samvaad?.getSources) {
        srcs = await window.samvaad.getSources()
      } else {
        // dev fallback
        srcs = [
          { id: 'mic', name: 'Microphone', type: 'mic' },
          { id: 'system', name: 'System Audio', type: 'system' }
        ]
      }
      setSources(srcs)
      
      // Auto-select first microphone if none selected
      if (!selectedSource && srcs.length > 0) {
        const firstMic = srcs.find(s => s.type === 'mic') || srcs[0]
        onSourceChange(firstMic)
      }
    } catch (e) {
      console.error('Failed to fetch sources:', e)
    } finally {
      setLoadingSources(false)
    }
  }

  useEffect(() => {
    fetchSources()
  }, [])

  const canStart = selectedSource && connectionStatus === 'connected'

  return (
    <header className="topbar glass">
      {/* Logo */}
      <div className="topbar-logo">
        <div className="logo-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="url(#logoGrad)"/>
            <path d="M8 9h8M8 12h5M8 15h6" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            <defs>
              <linearGradient id="logoGrad" x1="2" y1="2" x2="22" y2="22">
                <stop stopColor="hsl(220,90%,65%)"/>
                <stop offset="1" stopColor="hsl(260,80%,70%)"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="logo-text">
          <span className="logo-name">SAMVAAD</span>
          <span className="logo-sub">Meeting Intelligence</span>
        </div>
      </div>

      {/* Center controls */}
      <div className="topbar-center">
        {/* Source selector */}
        <div className="source-select-wrap">
          <label className="source-label">Source</label>
          <select
            id="source-selector"
            className="select source-select"
            value={selectedSource?.id || ''}
            onChange={e => {
              const src = sources.find(s => s.id === e.target.value)
              onSourceChange(src || null)
            }}
            disabled={isRecording}
          >
            <option value="">Select audio source…</option>
            <optgroup label="Microphone">
              {sources.filter(s => s.type === 'mic').map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
            <optgroup label="System / Apps">
              {sources.filter(s => s.type !== 'mic').map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
          </select>
          <span className="select-arrow">▾</span>
        </div>

        {/* Start/Stop */}
        <button
          id="start-stop-btn"
          className={`btn ${isRecording ? 'btn-danger' : 'btn-primary'} btn-lg record-btn`}
          onClick={onStartStop}
          disabled={!isRecording && !canStart}
          title={!selectedSource ? 'Select a source first' : ''}
          style={isRecording ? { boxShadow: `0 0 ${10 + micLevel * 100}px hsla(0, 80%, 60%, ${0.2 + micLevel * 2})` } : {}}
        >
          {isRecording ? (
            <>
              <div className="recording-dot" />
              Stop &nbsp;<span className="timer-display">{formatTime(sessionTimer)}</span>
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="10"/>
              </svg>
              Start Session
            </>
          )}
        </button>

        {/* Refresh sources */}
        <button
          className="btn btn-ghost btn-sm icon-btn"
          onClick={fetchSources}
          disabled={loadingSources || isRecording}
          data-tooltip="Refresh sources"
          id="refresh-sources-btn"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
        </button>
      </div>

      {/* Right actions */}
      <div className="topbar-right">
        {/* Connection status */}
        <div className="connection-status">
          <span
            className="status-dot"
            style={{ background: STATUS_COLORS[connectionStatus] || 'var(--text-muted)' }}
          />
          <span className="text-muted text-xs">{connectionStatus}</span>
        </div>

        <button
          id="speakers-btn"
          className="btn btn-ghost btn-sm"
          onClick={onOpenSpeakers}
          data-tooltip="Manage speakers"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Speakers
        </button>

        <button
          id="export-btn"
          className="btn btn-ghost btn-sm"
          onClick={onOpenExport}
          data-tooltip="Export MOM"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export
        </button>

        <button
          id="clear-session-btn"
          className="btn btn-ghost btn-sm"
          onClick={onClearSession}
          disabled={isRecording}
          data-tooltip="New session"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
          </svg>
        </button>
      </div>
    </header>
  )
}
