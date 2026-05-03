import React, { useState } from 'react'
import './ExportModal.css'

const formatMarkdown = (segments, summary, speakers, mode = 'all') => {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-IN', { dateStyle: 'full' })
  const timeStr = now.toLocaleTimeString('en-IN', { timeStyle: 'short' })

  let md = `# ${mode === 'summary' ? 'Meeting Summary' : mode === 'transcript' ? 'Meeting Transcript' : 'Minutes of Meeting'}\n`
  md += `**Date:** ${dateStr}  \n`
  md += `**Time:** ${timeStr}  \n\n`
  md += `---\n\n`

  // Participants (if all mode)
  if (mode === 'all') {
    const uniqueSpeakers = [...new Set(segments.map(s => s.speaker_id))]
    if (uniqueSpeakers.length > 0) {
      md += `## Participants\n`
      uniqueSpeakers.forEach(id => {
        md += `- ${speakers[id] || id}\n`
      })
      md += `\n`
    }
  }

  // Summary Section (if all or summary mode)
  if ((mode === 'all' || mode === 'summary') && summary) {
    if (summary.key_topics?.length > 0) {
      md += `## Key Topics\n`
      summary.key_topics.forEach(t => { md += `### ${t.topic}\n${t.summary}\n\n` })
    }
    if (summary.decisions?.length > 0) {
      md += `## Decisions\n`
      summary.decisions.forEach(d => { md += `- ${d}\n` })
      md += `\n`
    }
    if (summary.action_items?.length > 0) {
      md += `## Action Items\n`
      summary.action_items.forEach(a => {
        md += `- **${a.task}**`
        if (a.assignee) md += ` → ${a.assignee}`
        if (a.status) md += ` *(${a.status})*`
        md += `\n`
      })
      md += `\n`
    }
    if (summary.deadlines?.length > 0) {
      md += `## Deadlines\n`
      summary.deadlines.forEach(d => {
        md += `- ${d.task}`
        if (d.date) md += ` — **${d.date}**`
        if (d.assignee) md += ` (${d.assignee})`
        md += `\n`
      })
      md += `\n`
    }
  }

  // Transcript Section (if all or transcript mode)
  if (mode === 'all' || mode === 'transcript') {
    md += `## Full Transcript\n\n`
    segments.forEach(seg => {
      const name = speakers[seg.speaker_id] || seg.speaker_name || seg.speaker_id
      const time = seg.timestamp ? new Date(seg.timestamp).toLocaleTimeString('en-IN', { timeStyle: 'short' }) : ''
      md += `**[${time}] ${name}:** ${seg.text}\n\n`
    })
  }

  return md
}

export default function ExportModal({ segments, summary, speakers, onClose, mode = 'all' }) {
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(null)

  const handleExportMarkdown = async () => {
    setExporting(true)
    try {
      const md = formatMarkdown(segments, summary, speakers, mode)
      if (window.samvaad?.exportFile) {
        await window.samvaad.exportFile({ content: md, type: 'markdown' })
        setExported('markdown')
      } else {
        // Browser fallback
        const blob = new Blob([md], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `MOM_${new Date().toISOString().slice(0,10)}.md`
        a.click()
        URL.revokeObjectURL(url)
        setExported('markdown')
      }
    } catch (e) {
      console.error('Export failed:', e)
    } finally {
      setExporting(false)
    }
  }

  const handleExportTXT = async () => {
    setExporting(true)
    try {
      const md = formatMarkdown(segments, summary, speakers, mode)
      // Convert MD to a cleaner plain text for Notepad
      const txt = md.replace(/[*#]/g, '').replace(/---/g, '='.repeat(40))
      
      if (window.samvaad?.exportFile) {
        await window.samvaad.exportFile({ content: txt, type: 'txt' })
        setExported('txt')
      } else {
        const blob = new Blob([txt], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `MOM_${new Date().toISOString().slice(0,10)}.txt`
        a.click()
        URL.revokeObjectURL(url)
        setExported('txt')
      }
    } catch (e) {
      console.error('TXT export failed:', e)
    } finally {
      setExporting(false)
    }
  }

  const handleExportPDF = async () => {
    setExporting(true)
    try {
      const md = formatMarkdown(segments, summary, speakers, mode)
      if (window.samvaad?.exportFile) {
        await window.samvaad.exportFile({ content: md, type: 'pdf' })
        setExported('pdf')
      } else {
        // Browser fallback: Generate a clean print window for 'Carbon Copy' document
        const printWindow = window.open('', '_blank')
        const html = `
          <html>
            <head>
              <title>Minutes of Meeting - ${new Date().toLocaleDateString()}</title>
              <style>
                body { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto; padding: 50px; color: #111; line-height: 1.6; max-width: 800px; margin: 0 auto; }
                h1 { color: #1d4ed8; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 20px; font-size: 28px; }
                h2 { color: #334155; margin-top: 40px; border-left: 4px solid #3b82f6; padding-left: 15px; font-size: 20px; }
                p, li { font-size: 15px; color: #334155; }
                strong { color: #0f172a; }
                .meta { margin-bottom: 30px; padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
                .segment { margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9; }
                .timestamp { color: #94a3b8; font-family: monospace; font-size: 12px; margin-right: 10px; }
                .speaker { font-weight: 700; color: #1e293b; }
                @media print { body { padding: 0; } .no-print { display: none; } }
              </style>
            </head>
            <body>
              ${md.replace(/# (.*)/g, '<h1>$1</h1>')
                   .replace(/## (.*)/g, '<h2>$1</h2>')
                   .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                   .replace(/\n/g, '<br>')}
              <script>window.onload = () => { window.print(); window.close(); }</script>
            </body>
          </html>
        `
        printWindow.document.write(html)
        printWindow.document.close()
        setExported('pdf')
      }
    } catch (e) {
      console.error('PDF export failed:', e)
    } finally {
      setExporting(false)
    }
  }

  const stats = {
    speakers: [...new Set(segments.map(s => s.speaker_id))].length,
    segments: segments.length,
    words: segments.reduce((acc, s) => acc + s.text.split(' ').length, 0),
    decisions: summary?.decisions?.length || 0,
    actions: summary?.action_items?.length || 0,
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal glass animate-slide-up export-modal">
        <div className="modal-header">
          <div className="flex items-center gap-sm">
            <div className="modal-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div>
              <h2 className="modal-title">Export Minutes of Meeting</h2>
              <p className="modal-subtitle text-muted text-xs">Download structured MOM document</p>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} id="close-export-modal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Session stats */}
        <div className="export-stats">
          <div className="stat-card">
            <span className="stat-value">{stats.speakers}</span>
            <span className="stat-label">Speakers</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.segments}</span>
            <span className="stat-label">Segments</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.words.toLocaleString()}</span>
            <span className="stat-label">Words</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.decisions}</span>
            <span className="stat-label">Decisions</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.actions}</span>
            <span className="stat-label">Actions</span>
          </div>
        </div>

        {/* Export options */}
        <div className="export-options">
          <div className="export-option glass-hover" onClick={handleExportMarkdown}>
            <div className="export-option-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div className="export-option-info">
              <h3>.md — Markdown</h3>
              <p className="text-muted text-xs">Portable, version-control friendly format. Opens in any text editor.</p>
            </div>
            {exported === 'markdown' ? (
              <span className="badge badge-success">✓ Saved</span>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                disabled={exporting || segments.length === 0}
                id="export-markdown-btn"
                onClick={e => { e.stopPropagation(); handleExportMarkdown() }}
              >
                Download
              </button>
            )}
          </div>

          <div className="export-option glass-hover" onClick={handleExportPDF}>
            <div className="export-option-icon" style={{ color: 'var(--danger)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <path d="M16 13H8m8 4H8"/>
              </svg>
            </div>
            <div className="export-option-info">
              <h3>.pdf — PDF Document</h3>
              <p className="text-muted text-xs">High-quality 'Carbon Copy' of the meeting interface.</p>
            </div>
            {exported === 'pdf' ? (
              <span className="badge badge-success">✓ Saved</span>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                disabled={exporting || segments.length === 0}
                id="export-pdf-btn"
                onClick={e => { e.stopPropagation(); handleExportPDF() }}
              >
                Download
              </button>
            )}
          </div>

          <div className="export-option glass-hover" onClick={handleExportTXT}>
            <div className="export-option-icon" style={{ color: 'var(--text-muted)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <path d="M10 13H8m8 4H8m2-4h-2m2 4h-2"/>
              </svg>
            </div>
            <div className="export-option-info">
              <h3>.txt — Notepad</h3>
              <p className="text-muted text-xs">Simple plain text version for quick notes.</p>
            </div>
            {exported === 'txt' ? (
              <span className="badge badge-success">✓ Saved</span>
            ) : (
              <button
                className="btn btn-ghost btn-sm"
                disabled={exporting || segments.length === 0}
                id="export-txt-btn"
                onClick={e => { e.stopPropagation(); handleExportTXT() }}
              >
                Download
              </button>
            )}
          </div>
        </div>

        {segments.length === 0 && (
          <p className="text-muted text-sm" style={{ textAlign: 'center', marginTop: 8 }}>
            No transcript data to export yet.
          </p>
        )}
      </div>
    </div>
  )
}
