import React, { useState, useEffect } from 'react'
import './FirstRunScreen.css'

const STEPS = [
  { id: 'whisper', label: 'Whisper Speech Model',  desc: 'faster-whisper tiny.en (~75 MB)', icon: '🎙️' },
  { id: 'gemini',  label: 'Gemini AI Summarizer',  desc: 'Google Gemini 2.0 Flash (API)',    icon: '⚡' },
]

export default function FirstRunScreen({ onComplete }) {
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState({})   // { model_id: percent }
  const [statuses, setStatuses] = useState({})   // { model_id: 'pending'|'downloading'|'done'|'error' }
  const [currentStep, setCurrentStep] = useState(null)
  const [allDone, setAllDone] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!window.samvaad) return
    const unsub = window.samvaad.onDownloadProgress(({ model, percent, status }) => {
      setProgress(p => ({ ...p, [model]: percent }))
      setStatuses(s => ({ ...s, [model]: status }))
      setCurrentStep(model)
      if (status === 'done') {
        const allComplete = STEPS.every(step =>
          statuses[step.id] === 'done' || step.id === model
        )
        if (allComplete) setAllDone(true)
      }
    })
    return unsub
  }, [statuses])

  const handleStart = async () => {
    setError(null)
    setDownloading(true)
    const initial = {}
    STEPS.forEach(s => { initial[s.id] = 'pending' })
    setStatuses(initial)

    if (window.samvaad?.startDownloads) {
      await window.samvaad.startDownloads({ skipDiarize: true })
    } else {
      // Dev simulation
      simulateDownloads()
    }
  }

  const simulateDownloads = async () => {
    for (const step of STEPS) {
      setCurrentStep(step.id)
      setStatuses(s => ({ ...s, [step.id]: 'downloading' }))
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(r => setTimeout(r, 120))
        setProgress(p => ({ ...p, [step.id]: i }))
      }
      setStatuses(s => ({ ...s, [step.id]: 'done' }))
    }
    setAllDone(true)
  }

  const statusIcon = (stepId) => {
    const s = statuses[stepId]
    if (s === 'done')     return <span className="step-done">✓</span>
    if (s === 'error')    return <span className="step-error">✗</span>
    if (s === 'downloading') return (
      <svg className="step-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
    )
    return <span className="step-pending">○</span>
  }

  return (
    <div className="firstrun-root">
      <div className="bg-grid" aria-hidden="true" />
      <div className="orb orb-1" aria-hidden="true" />
      <div className="orb orb-2" aria-hidden="true" />

      <div className="firstrun-card glass animate-fade-in">
        {/* Header */}
        <div className="firstrun-header">
          <div className="firstrun-logo">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="url(#frLogoGrad)"/>
              <path d="M8 9h8M8 12h5M8 15h6" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <defs>
                <linearGradient id="frLogoGrad" x1="2" y1="2" x2="22" y2="22">
                  <stop stopColor="hsl(220,90%,65%)"/>
                  <stop offset="1" stopColor="hsl(260,80%,70%)"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="firstrun-title">Welcome to SAMVAAD</h1>
          <p className="firstrun-subtitle text-muted">
            {downloading ? 'Setting up AI models…' : 'First-time setup — initialize AI assets'}
          </p>
        </div>

        {!downloading ? (
          <>
            {/* Models list */}
            <div className="models-preview">
              {STEPS.map(step => (
                <div key={step.id} className="model-row">
                  <span className="model-emoji">{step.icon}</span>
                  <div className="model-info">
                    <span className="model-name">{step.label}</span>
                    <span className="model-desc text-muted text-xs">{step.desc}</span>
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <div className="error-banner">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary btn-lg w-full"
              onClick={handleStart}
              id="start-download-btn"
            >
              Initialize AI &amp; Get Started
            </button>
          </>
        ) : (
          <>
            {/* Download progress */}
            <div className="download-steps">
              {STEPS.map(step => {
                const pct = progress[step.id] || 0
                const status = statuses[step.id] || 'pending'
                const isActive = currentStep === step.id
                return (
                  <div key={step.id} className={`download-step ${isActive ? 'step-active' : ''}`}>
                    <div className="step-top">
                      <div className="flex items-center gap-sm">
                        <span>{step.icon}</span>
                        <span className="step-name">{step.label}</span>
                      </div>
                      <div className="flex items-center gap-sm">
                        {status === 'downloading' && (
                          <span className="text-muted text-xs">{pct}%</span>
                        )}
                        {statusIcon(step.id)}
                      </div>
                    </div>
                    {(status === 'downloading' || status === 'done') && (
                      <div className="progress-bar" style={{ marginTop: 8 }}>
                        <div
                          className="progress-fill"
                          style={{ width: `${status === 'done' ? 100 : pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {allDone && (
              <div className="done-section animate-fade-in">
                <div className="done-icon">🎉</div>
                <h3>All set! SAMVAAD is ready.</h3>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={onComplete}
                  id="launch-app-btn"
                >
                  Launch SAMVAAD
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
