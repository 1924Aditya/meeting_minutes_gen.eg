/**
 * In-memory speaker name mapping with session scoping.
 * Persisted to SQLite via db.updateSpeakerMap().
 */
export class SpeakerMapManager {
  constructor() {
    // Map<sessionId, Map<speakerId, name>>
    this._store = new Map()
  }

  _session(sessionId) {
    if (!this._store.has(sessionId)) {
      this._store.set(sessionId, new Map())
    }
    return this._store.get(sessionId)
  }

  setName(sessionId, speakerId, name) {
    this._session(sessionId).set(speakerId, name)
  }

  getName(sessionId, speakerId) {
    return this._session(sessionId).get(speakerId) || null
  }

  getAll(sessionId) {
    const obj = {}
    for (const [k, v] of this._session(sessionId)) obj[k] = v
    return obj
  }

  loadFromDb(sessionId, map) {
    Object.entries(map).forEach(([k, v]) => {
      this._session(sessionId).set(k, v)
    })
  }
}
