import test from 'node:test'
import assert from 'node:assert/strict'
import { exportMarkdown } from '../src/exporter.js'

test('markdown export contains summary and transcript sections', () => {
  const markdown = exportMarkdown({
    id: 'session-1',
    segments: [{
      speaker_id: 'Spk_0',
      speaker_name: 'Alice',
      timestamp: '2026-11-21T10:00:00.000Z',
      text: 'The release is approved.'
    }],
    summary: {
      decisions: ['Release approved'],
      action_items: [{ task: 'Publish release', assignee: 'Alice', status: 'pending' }],
      deadlines: []
    },
    speakers: { Spk_0: 'Alice' }
  })

  assert.match(markdown, /Minutes of Meeting/)
  assert.match(markdown, /Release approved/)
  assert.match(markdown, /Publish release/)
  assert.match(markdown, /Alice/)
})
