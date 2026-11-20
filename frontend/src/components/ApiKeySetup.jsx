import React, { useState } from 'react'
import './ApiKeySetup.css'

export default function ApiKeySetup({ onKeySubmit }) {
  const [key, setKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = key.trim()
    if (!trimmed) return

    setTesting(true)
    setError(null)

    try {
      // Quick validation: call Gemini with a tiny prompt
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${trimmed}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Reply with one word: ready' }] }],
            generationConfig: { maxOutputTokens: 5 }
          })
        }
      )
      const data = await res.json()
      if (data.error) {
        setError(`Invalid API key: ${data.error.message}`)
        setTesting(false)
        return
      }
      // Key is valid
      localStorage.setItem('samvaad_gemini_key', trimmed)
      onKeySubmit(trimmed)
    } catch (err) {
      setError('Could not validate key. Check your connection and try again.')
      setTesting(false)
    }
  }

  return (
    <div className="setup-root">
      <div className="bg-grid" aria-hidden="true" />
      <div className="orb orb-1" aria-hidden="true" />
      <div className="orb orb-2" aria-hidden="true" />

      <div className="setup-card glass">
        <div className="setup-logo">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
          </svg>
        </div>

        <h1 className="setup-title">SAMVAAD</h1>
        <p className="setup-subtitle">AI Meeting Intelligence</p>

        <div className="setup-divider" />

        <p className="setup-description">
          To generate real-time summaries, SAMVAAD needs your personal
          <strong> Google Gemini API key</strong>. Your key is stored only
          in your browser and never sent to our servers.
        </p>

        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="setup-get-key-link"
        >
          🔑 Get a free API key from Google AI Studio →
        </a>

        <form onSubmit={handleSubmit} className="setup-form">
          <div className="setup-input-group">
            <input
              type="password"
              className="setup-input"
              placeholder="Paste your Gemini API key here..."
              value={key}
              onChange={e => { setKey(e.target.value); setError(null) }}
              autoFocus
              spellCheck={false}
            />
          </div>

          {error && (
            <div className="setup-error">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            className="setup-btn"
            disabled={!key.trim() || testing}
          >
            {testing ? (
              <span className="setup-loading">
                <span className="wave-dots"><span/><span/><span/></span>
                Validating…
              </span>
            ) : 'Continue →'}
          </button>
        </form>

        <p className="setup-privacy">
          🔒 Your key stays in your browser's localStorage. Clear it anytime in Settings.
        </p>
      </div>
    </div>
  )
}
