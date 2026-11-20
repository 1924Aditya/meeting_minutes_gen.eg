import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DATA_DIR = process.env.DATA_DIR || path.join(
  process.env.APPDATA || process.env.HOME || '.',
  'samvaad'
)
const DB_PATH = path.join(DATA_DIR, 'samvaad.db')

let db = null

export function initDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')   // better concurrent write perf
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at   TEXT,
      title      TEXT
    );

    CREATE TABLE IF NOT EXISTS segments (
      id           TEXT PRIMARY KEY,
      session_id   TEXT NOT NULL REFERENCES sessions(id),
      timestamp    TEXT NOT NULL,
      speaker_id   TEXT NOT NULL,
      speaker_name TEXT,
      text         TEXT NOT NULL,
      entities     TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS speaker_map (
      session_id   TEXT NOT NULL,
      speaker_id   TEXT NOT NULL,
      speaker_name TEXT NOT NULL,
      PRIMARY KEY (session_id, speaker_id)
    );

    CREATE TABLE IF NOT EXISTS summaries (
      session_id   TEXT PRIMARY KEY REFERENCES sessions(id),
      decisions    TEXT DEFAULT '[]',
      action_items TEXT DEFAULT '[]',
      deadlines    TEXT DEFAULT '[]',
      updated_at   TEXT
    );
  `)

  console.log(`[DB] Initialized at ${DB_PATH}`)
}

// ── Sessions ──────────────────────────────────────────────────────────────────
export function createSession(id) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO sessions (id, started_at) VALUES (?, ?)
  `)
  stmt.run(id, new Date().toISOString())
}

export function endSession(id) {
  db.prepare(`UPDATE sessions SET ended_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), id)
}

// ── Segments ──────────────────────────────────────────────────────────────────
export function saveSegment(sessionId, segment) {
  // Auto-create session if not exists
  createSession(sessionId)

  db.prepare(`
    INSERT OR REPLACE INTO segments
      (id, session_id, timestamp, speaker_id, speaker_name, text, entities)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    segment.id,
    sessionId,
    segment.timestamp || new Date().toISOString(),
    segment.speaker_id,
    segment.speaker_name || null,
    segment.text,
    JSON.stringify(segment.entities || [])
  )
}

export function getSegments(sessionId) {
  return db.prepare(`
    SELECT * FROM segments WHERE session_id = ? ORDER BY timestamp ASC
  `).all(sessionId).map(row => ({
    ...row,
    entities: JSON.parse(row.entities || '[]')
  }))
}

// ── Speaker map ───────────────────────────────────────────────────────────────
export function updateSpeakerMap(sessionId, speakerId, name) {
  db.prepare(`
    INSERT OR REPLACE INTO speaker_map (session_id, speaker_id, speaker_name)
    VALUES (?, ?, ?)
  `).run(sessionId, speakerId, name)
}

export function getSpeakerMap(sessionId) {
  const rows = db.prepare(`
    SELECT speaker_id, speaker_name FROM speaker_map WHERE session_id = ?
  `).all(sessionId)
  const map = {}
  rows.forEach(r => { map[r.speaker_id] = r.speaker_name })
  return map
}

// ── Summary ───────────────────────────────────────────────────────────────────
export function saveSummary(sessionId, summary) {
  db.prepare(`
    INSERT OR REPLACE INTO summaries
      (session_id, decisions, action_items, deadlines, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    sessionId,
    JSON.stringify(summary.decisions || []),
    JSON.stringify(summary.action_items || []),
    JSON.stringify(summary.deadlines || []),
    new Date().toISOString()
  )
}

export function getSummary(sessionId) {
  const row = db.prepare(`SELECT * FROM summaries WHERE session_id = ?`).get(sessionId)
  if (!row) return null
  return {
    decisions:    JSON.parse(row.decisions || '[]'),
    action_items: JSON.parse(row.action_items || '[]'),
    deadlines:    JSON.parse(row.deadlines || '[]')
  }
}

// ── Full session ──────────────────────────────────────────────────────────────
export function getFullSession(sessionId) {
  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId)
  if (!session) return null
  return {
    ...session,
    segments: getSegments(sessionId),
    summary:  getSummary(sessionId),
    speakers: getSpeakerMap(sessionId)
  }
}

// ── Last incomplete session (crash recovery) ──────────────────────────────────
export function getLastIncompleteSession() {
  const session = db.prepare(`
    SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1
  `).get()
  return session ? getFullSession(session.id) : null
}
