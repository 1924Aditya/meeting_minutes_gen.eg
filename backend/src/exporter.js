import puppeteer from 'puppeteer'

// ── Markdown Export ───────────────────────────────────────────────────────────
export function exportMarkdown(session) {
  const { segments = [], summary, speakers = {} } = session
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-IN', { dateStyle: 'full' })
  const timeStr = now.toLocaleTimeString('en-IN', { timeStyle: 'short' })

  let md = `# Minutes of Meeting\n\n`
  md += `| Field | Value |\n|---|---|\n`
  md += `| **Date** | ${dateStr} |\n`
  md += `| **Time** | ${timeStr} |\n`
  md += `| **Session ID** | \`${session.id}\` |\n\n`
  md += `---\n\n`

  // Participants
  const uniqueSpeakers = [...new Set(segments.map(s => s.speaker_id))]
  if (uniqueSpeakers.length) {
    md += `## 👥 Participants\n\n`
    uniqueSpeakers.forEach(id => {
      md += `- **${speakers[id] || id}**\n`
    })
    md += `\n`
  }

  // Summary
  if (summary?.decisions?.length) {
    md += `## ⚡ Decisions\n\n`
    summary.decisions.forEach((d, i) => { md += `${i + 1}. ${d}\n` })
    md += `\n`
  }

  if (summary?.action_items?.length) {
    md += `## ✅ Action Items\n\n`
    md += `| Task | Assignee | Status |\n|---|---|---|\n`
    summary.action_items.forEach(a => {
      md += `| ${a.task} | ${a.assignee || '—'} | ${a.status || 'pending'} |\n`
    })
    md += `\n`
  }

  if (summary?.deadlines?.length) {
    md += `## ⏰ Deadlines\n\n`
    summary.deadlines.forEach(d => {
      md += `- **${d.task}** — ${d.date || 'TBD'}`
      if (d.assignee) md += ` *(${d.assignee})*`
      md += `\n`
    })
    md += `\n`
  }

  // Transcript
  md += `## 📝 Full Transcript\n\n`
  segments.forEach(seg => {
    const name = speakers[seg.speaker_id] || seg.speaker_name || seg.speaker_id
    const time = seg.timestamp
      ? new Date(seg.timestamp).toLocaleTimeString('en-IN', { timeStyle: 'medium' })
      : ''
    md += `**[${time}] ${name}:** ${seg.text}\n\n`
  })

  return md
}

// ── PDF Export ────────────────────────────────────────────────────────────────
const PDF_CSS = `
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a2e; line-height: 1.6; padding: 40px 60px; max-width: 800px; margin: 0 auto; }
  h1   { font-size: 24px; color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 20px; }
  h2   { font-size: 16px; color: #1e40af; margin-top: 28px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
  th   { background: #eff6ff; color: #1e40af; padding: 8px 12px; text-align: left; border: 1px solid #bfdbfe; }
  td   { padding: 7px 12px; border: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f8fafc; }
  li   { margin-bottom: 4px; }
  code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
  strong { color: #1e40af; }
  hr   { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
  .participant-tag { display: inline-block; background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 2px 10px; border-radius: 12px; margin: 2px; font-size: 12px; }
`

function markdownToHtml(md) {
  // Simple converter for our specific MOM format
  let html = md
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>\n?)+/gs, match => `<ul>${match}</ul>`)
  return `<p>${html}</p>`
}

export async function exportPDF(session) {
  const md  = exportMarkdown(session)
  const body = markdownToHtml(md)
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${PDF_CSS}</style></head><body>${body}</body></html>`

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  const page    = await browser.newPage()
  await page.setContent(fullHtml, { waitUntil: 'networkidle0' })

  const pdf = await page.pdf({
    format:            'A4',
    margin:            { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    printBackground:   true,
    displayHeaderFooter: true,
    headerTemplate:    `<div style="font-size:9px;color:#666;width:100%;text-align:center;">SAMVAAD — Minutes of Meeting</div>`,
    footerTemplate:    `<div style="font-size:9px;color:#666;width:100%;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`
  })

  await browser.close()
  return pdf
}
