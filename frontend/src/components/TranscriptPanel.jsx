import React, { useEffect, useRef, useState, useCallback } from 'react'
import { format } from 'date-fns'
import './TranscriptPanel.css'

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

function getSpeakerInitial(name) {
  return (name || '?')[0].toUpperCase()
}

function renderTextWithEntities(text, entities = []) {
  if (!entities.length) return text
  const sorted = [...entities].sort((a, b) => a.start - b.start)
  const parts = []
  let cursor = 0
  for (const ent of sorted) {
    if (ent.start > cursor) parts.push(text.slice(cursor, ent.start))
    parts.push(
      <mark key={`${ent.start}-${ent.end}`} className={`entity-${ent.label}`}>
        {text.slice(ent.start, ent.end)}
      </mark>
    )
    cursor = ent.end
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}

function AnimatedText({ text, isInitialNew }) {
  const [parts, setParts] = useState([{ text, isNew: isInitialNew }])
  const prevTextRef = useRef(text)

  useEffect(() => {
    const prev = prevTextRef.current
    if (text === prev) return

    if (text.startsWith(prev)) {
      const newPart = text.slice(prev.length)
      setParts([
        { text: prev, isNew: false },
        { text: newPart, isNew: true }
      ])
    } else {
      setParts([{ text, isNew: false }])
    }
    prevTextRef.current = text
  }, [text])

  return (
    <>
      {parts.map((p, i) => {
        if (!p.isNew) return <span key={i}>{p.text}</span>
        
        // Split new part into words for a staggered reveal
        const words = p.text.split(/(\s+)/)
        return (
          <span key={i}>
            {words.map((word, wi) => (
              <span 
                key={wi} 
                className="text-reveal"
                style={{ animationDelay: `${wi * 30}ms` }}
              >
                {word}
              </span>
            ))}
          </span>
        )
      })}
    </>
  )
}

function TranscriptSegment({ segment, speakers, isNew }) {
  const name = speakers[segment.speaker_id] || segment.speaker_name || segment.speaker_id
  const color = getSpeakerColor(segment.speaker_id)
  const time = segment.timestamp ? format(new Date(segment.timestamp), 'HH:mm') : ''

  return (
    <div className={`transcript-segment ${isNew ? 'segment-new' : ''}`} data-speaker={segment.speaker_id}>
      <div className="segment-avatar" style={{ '--speaker-color': color }}>
        {getSpeakerInitial(name)}
      </div>
      <div className="segment-body">
        <div className="segment-header">
          <span className="segment-speaker" style={{ color }}>{name}</span>
          {time && <span className="segment-time font-mono text-xs">{time}</span>}
        </div>
        <p className="segment-text">
          <AnimatedText text={segment.text} entities={segment.entities} isInitialNew={isNew} />
        </p>
      </div>
    </div>
  )
}

export default function TranscriptPanel({ segments, speakers, isRecording, onExport }) {
  const scrollRef = useRef(null)
  const [isScrollLocked, setIsScrollLocked] = useState(false)
  const [lastSegmentCount, setLastSegmentCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [filtered, setFiltered] = useState(segments)

  // Auto-scroll
  useEffect(() => {
    if (!isScrollLocked && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    setLastSegmentCount(segments.length)
  }, [segments, isScrollLocked])

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    setIsScrollLocked(!isAtBottom)
  }, [])

  // Filter
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFiltered(segments)
    } else {
      const q = searchQuery.toLowerCase()
      setFiltered(segments.filter(s =>
        s.text.toLowerCase().includes(q) ||
        (speakers[s.speaker_id] || s.speaker_name || '').toLowerCase().includes(q)
      ))
    }
  }, [segments, speakers, searchQuery])

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      setIsScrollLocked(false)
    }
  }

  return (
    <section className="panel transcript-panel glass" aria-label="Live Transcript">
      <div className="panel-header">
        <div className="flex items-center gap-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <h2 className="panel-title">Live Transcript</h2>
          {segments.length > 0 && (
            <span className="badge badge-muted">{segments.length}</span>
          )}
        </div>
        <div className="flex items-center gap-sm">
          {segments.length > 0 && (
            <button
              className="btn btn-ghost btn-xs icon-btn"
              onClick={onExport}
              title="Export Transcript"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
          )}
          {isRecording && <div className="recording-dot" />}
        </div>
      </div>

      {/* Search */}
      <div className="transcript-search">
        <div className="search-wrap">
          <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            className="input search-input"
            placeholder="Search transcript…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            id="transcript-search"
          />
        </div>
      </div>

      {/* Scroll area */}
      <div
        className="transcript-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {filtered.length === 0 ? (
          <div className="transcript-empty">
            {isRecording ? (
              <div className="waiting-indicator">
                <div className="wave-dots">
                  <span/><span/><span/>
                </div>
                <p className="text-muted">Listening…</p>
              </div>
            ) : (
              <div className="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
                <p className="text-muted">Select a source and start recording</p>
              </div>
            )}
          </div>
        ) : (
          <div className="transcript-list">
            {filtered.map((seg, i) => (
              <TranscriptSegment
                key={seg.id || `seg-${i}`}
                segment={seg}
                speakers={speakers}
                isNew={i >= lastSegmentCount}
              />
            ))}
          </div>
        )}
      </div>

      {/* Scroll-lock indicator */}
      {isScrollLocked && (
        <button className="scroll-lock-badge" onClick={scrollToBottom} id="scroll-to-bottom-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          Jump to bottom
        </button>
      )}
    </section>
  )
}
