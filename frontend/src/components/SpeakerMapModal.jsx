import React, { useState } from 'react'
import './SpeakerMapModal.css'

const SPEAKER_COLORS = [
  'hsl(220,80%,70%)',
  'hsl(145,65%,60%)',
  'hsl(40,90%,65%)',
  'hsl(300,70%,70%)',
  'hsl(180,65%,60%)',
  'hsl(0,75%,68%)',
]

function getSpeakerColor(speakerId) {
  const idx = parseInt(speakerId?.replace(/\D/g, '') || '0', 10) % SPEAKER_COLORS.length
  return SPEAKER_COLORS[idx]
}

export default function SpeakerMapModal({ speakers, suggestion, onUpdate, onClose }) {
  // speakers: { speaker_id: name }
  const [editValues, setEditValues] = useState({ ...speakers })
  const [saved, setSaved] = useState(false)

  const speakerIds = Object.keys(speakers)

  const handleSave = () => {
    Object.entries(editValues).forEach(([id, name]) => {
      if (name !== speakers[id]) onUpdate(id, name)
    })
    setSaved(true)
    setTimeout(onClose, 800)
  }

  const handleAcceptSuggestion = () => {
    if (!suggestion) return
    setEditValues(prev => ({ ...prev, [suggestion.speaker_id]: suggestion.suggested_name }))
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal glass animate-slide-up speaker-modal">
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-sm">
            <div className="modal-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <h2 className="modal-title">Speaker Mapping</h2>
              <p className="modal-subtitle text-muted text-xs">Assign real names to detected speakers</p>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} id="close-speaker-modal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Suggestion banner */}
        {suggestion && (
          <div className="suggestion-banner">
            <div className="suggestion-icon">💡</div>
            <div className="suggestion-body">
              <span className="text-sm">
                <strong>{suggestion.speaker_id}</strong> said "My name is{' '}
                <strong>{suggestion.suggested_name}</strong>"
              </span>
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleAcceptSuggestion} id="accept-suggestion-btn">
              Accept
            </button>
          </div>
        )}

        {/* Speaker list */}
        <div className="speaker-list">
          {speakerIds.length === 0 ? (
            <div className="no-speakers">
              <p className="text-muted text-sm">No speakers detected yet. Start recording to identify speakers.</p>
            </div>
          ) : (
            speakerIds.map(id => {
              const color = getSpeakerColor(id)
              return (
                <div key={id} className="speaker-row">
                  <div className="speaker-avatar" style={{ '--speaker-color': color }}>
                    {(editValues[id] || id)[0].toUpperCase()}
                  </div>
                  <div className="speaker-info">
                    <span className="speaker-id text-xs text-muted">{id}</span>
                    <input
                      type="text"
                      className="input speaker-name-input"
                      value={editValues[id] || ''}
                      placeholder={`Name for ${id}…`}
                      onChange={e => setEditValues(prev => ({ ...prev, [id]: e.target.value }))}
                      id={`speaker-input-${id}`}
                    />
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} id="cancel-speaker-modal">Cancel</button>
          <button
            className={`btn ${saved ? 'btn-success-state' : 'btn-primary'}`}
            onClick={handleSave}
            disabled={speakerIds.length === 0}
            id="save-speakers-btn"
          >
            {saved ? '✓ Saved' : 'Save Mapping'}
          </button>
        </div>
      </div>
    </div>
  )
}
