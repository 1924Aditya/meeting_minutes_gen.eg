import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'

test('database persists sessions, segments, summaries, and speaker maps', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'samvaad-test-'))
  process.env.DATA_DIR = dataDir

  const db = await import('../src/db.js')
  db.initDb()

  db.createSession('test-session')
  db.saveSegment('test-session', {
    id: 'segment-1',
    timestamp: '2026-11-21T10:00:00.000Z',
    speaker_id: 'Spk_0',
    speaker_name: 'Alice',
    text: 'The meeting starts at 10.',
    entities: []
  })
  db.updateSpeakerMap('test-session', 'Spk_0', 'Alice')
  db.saveSummary('test-session', {
    key_topics: [{ topic: 'Schedule', summary: 'Meeting time confirmed' }],
    decisions: ['Start at 10'],
    action_items: [{ task: 'Send agenda', assignee: 'Alice', status: 'pending' }],
    deadlines: []
  })

  const session = db.getFullSession('test-session')
  assert.equal(session.id, 'test-session')
  assert.equal(session.segments[0].text, 'The meeting starts at 10.')
  assert.equal(session.speakers.Spk_0, 'Alice')
  assert.deepEqual(session.summary.decisions, ['Start at 10'])
  assert.equal(session.summary.key_topics[0].topic, 'Schedule')

  db.endSession('test-session')
  db.closeDb()
  fs.rmSync(dataDir, { recursive: true, force: true })
})
