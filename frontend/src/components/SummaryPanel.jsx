import React, { useState, useEffect, useRef, useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import './SummaryPanel.css'

function ActionItem({ item, index }) {
  const statusColors = {
    pending:     'var(--text-muted)',
    in_progress: 'var(--warning)',
    done:        'var(--success)'
  }
  const statusIcons = {
    pending:     '○',
    in_progress: '◐',
    done:        '●'
  }

  return (
    <div className="action-item animate-fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
      <span className="action-status-icon" style={{ color: statusColors[item.status || 'pending'] }}>
        {statusIcons[item.status || 'pending']}
      </span>
      <div className="action-body">
        <span className="action-task">{item.task}</span>
        {item.assignee && (
          <span className="action-assignee">→ {item.assignee}</span>
        )}
      </div>
    </div>
  )
}

function Decision({ text, index }) {
  return (
    <div className="decision-item animate-fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
      <div className="decision-bullet" />
      <span>{text}</span>
    </div>
  )
}

function Deadline({ item, index }) {
  return (
    <div className="deadline-item animate-fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
      <div className="deadline-icon">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>
      <div className="deadline-body">
        <span className="deadline-task">{item.task}</span>
        <div className="deadline-meta">
          {item.date && <span className="badge badge-warning text-xs">{item.date}</span>}
          {item.assignee && <span className="text-muted text-xs">{item.assignee}</span>}
        </div>
      </div>
    </div>
  )
}

function Topic({ item, index }) {
  return (
    <div className="topic-item animate-fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
      <div className="topic-header">
        <span className="topic-title">{item.topic}</span>
      </div>
      <p className="topic-summary text-muted text-xs">{item.summary}</p>
    </div>
  )
}

function SummarySection({ icon, title, count, accentColor, children, emptyMessage }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="summary-section" style={{ '--section-accent': accentColor }}>
      <button
        className="section-header"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
      >
        <div className="section-header-left">
          <span className="section-icon">{icon}</span>
          <h3 className="section-title">{title}</h3>
          <span className="badge badge-muted">{count}</span>
        </div>
        <svg
          className={`chevron ${collapsed ? 'chevron-up' : ''}`}
          width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {!collapsed && (
        <div className="section-body">
          {count === 0 ? (
            <p className="section-empty text-muted text-sm">{emptyMessage}</p>
          ) : children}
        </div>
      )}
    </div>
  )
}

export default function SummaryPanel({ summary, isRecording, onExport }) {
  const [lastUpdated, setLastUpdated] = useState(null)
  const [updateFlash, setUpdateFlash] = useState(false)
  const prevSummaryRef = useRef(null)

  // Detect summary changes
  useEffect(() => {
    if (!summary) return
    const prev = prevSummaryRef.current
    const changed =
      !prev ||
      prev.key_topics?.length !== summary.key_topics?.length ||
      prev.decisions?.length !== summary.decisions?.length ||
      prev.action_items?.length !== summary.action_items?.length ||
      prev.deadlines?.length !== summary.deadlines?.length
    if (changed) {
      setLastUpdated(new Date())
      setUpdateFlash(true)
      setTimeout(() => setUpdateFlash(false), 1200)
      prevSummaryRef.current = summary
    }
  }, [summary])

  const topics = summary?.key_topics || []
  const decisions = summary?.decisions || []
  const actionItems = summary?.action_items || []
  const deadlines = summary?.deadlines || []
  const totalItems = topics.length + decisions.length + actionItems.length + deadlines.length

  return (
    <section
      className={`panel summary-panel glass ${updateFlash ? 'panel-flash' : ''}`}
      aria-label="Project Pulse — Summary"
    >
      <div className="panel-header">
        <div className="flex items-center gap-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <h2 className="panel-title">Project Pulse</h2>
          {totalItems > 0 && (
            <span className="badge badge-primary">{totalItems}</span>
          )}
        </div>

        <div className="flex items-center gap-sm">
          {totalItems > 0 && (
            <button
              className="btn btn-ghost btn-xs icon-btn"
              onClick={onExport}
              title="Export Summary"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
          )}
          {lastUpdated && (
            <span className="last-updated text-xs text-muted">
              Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
            </span>
          )}
          {isRecording && (
            <span className="badge badge-success pulse-badge">
              <div className="recording-dot" style={{ width: 6, height: 6 }} />
              Live
            </span>
          )}
        </div>
      </div>

      <div className="summary-scroll">
        {totalItems === 0 ? (
          <div className="summary-empty">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.25">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p className="text-muted" style={{ textAlign: 'center', maxWidth: 200, lineHeight: 1.6 }}>
              {isRecording
                ? 'Summary will appear after a few minutes of conversation…'
                : 'Start a session to generate your meeting summary'}
            </p>
            {isRecording && (
              <div className="summary-generating">
                <div className="wave-dots">
                  <span/><span/><span/>
                </div>
                <span className="text-muted text-xs">Generating…</span>
              </div>
            )}
          </div>
        ) : (
          <div className="summary-content">
            <SummarySection
              icon="💡"
              title="Key Topics"
              count={topics.length}
              accentColor="var(--info)"
              emptyMessage="Identifying main topics..."
            >
              {topics.map((t, i) => (
                <Topic key={i} item={t} index={i} />
              ))}
            </SummarySection>

            <SummarySection
              icon="⚡"
              title="Decisions"
              count={decisions.length}
              accentColor="var(--primary)"
              emptyMessage="No decisions recorded yet"
            >
              {decisions.map((d, i) => (
                <Decision key={i} text={d} index={i} />
              ))}
            </SummarySection>

            <SummarySection
              icon="✅"
              title="Action Items"
              count={actionItems.length}
              accentColor="var(--success)"
              emptyMessage="No action items assigned yet"
            >
              {actionItems.map((a, i) => (
                <ActionItem key={i} item={a} index={i} />
              ))}
            </SummarySection>

            <SummarySection
              icon="⏰"
              title="Deadlines"
              count={deadlines.length}
              accentColor="var(--warning)"
              emptyMessage="No deadlines mentioned yet"
            >
              {deadlines.map((d, i) => (
                <Deadline key={i} item={d} index={i} />
              ))}
            </SummarySection>
          </div>
        )}
      </div>
    </section>
  )
}
