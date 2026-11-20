import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import { v4 as uuidv4 } from 'uuid'
import WebSocket from 'ws'
import { initDb, saveSegment, saveSummary, updateSpeakerMap, getFullSession, endSession } from './db.js'
import { broadcastToClients, clientsMap } from './wsClients.js'
import { SpeakerMapManager } from './speakerMap.js'
import { exportMarkdown, exportPDF } from './exporter.js'

// ── Config ────────────────────────────────────────────────────────────────────
const BACKEND_PORT = parseInt(process.env.PORT || process.env.BACKEND_PORT || '3001')
const AI_SERVICE_PORT = parseInt(process.env.AI_SERVICE_PORT || '8766')
const AI_WS_URL       = `ws://127.0.0.1:${AI_SERVICE_PORT}`

// ── State ─────────────────────────────────────────────────────────────────────
let currentSessionId = null
let aiSocket = null
let aiConnected = false
let chunkQueue = []
const QUEUE_MAX = 10

// ── Browser-mode summarization state ─────────────────────────────────────────
let sessionGeminiKey  = process.env.GEMINI_API_KEY || null  // server fallback key
let sessionBuffer     = []   // { speaker_id, text, timestamp }
let lastSummarizedIdx = 0
let summaryTimer      = null
let previousSummary   = null

const SUMMARY_INTERVAL_MS = 30_000  // summarize every 30s
const MIN_NEW_WORDS       = 15      // don't call LLM unless ≥15 new words

const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash'
]

const SYSTEM_PROMPT = `You are a professional meeting intelligence agent.
Analyze the transcript and output ONLY valid JSON (no markdown, no explanation):
{
  "key_topics": [{"topic": "string", "summary": "string"}],
  "decisions": ["string"],
  "action_items": [{"task": "string", "assignee": "string or null", "status": "pending"}],
  "deadlines": [{"task": "string", "date": "string or null", "assignee": "string or null"}]
}
Rules: Be concise, professional, boardroom-quality. Update prior state with new info.`

async function transcribeAudioChunkGemini(base64Audio, apiKey) {
  if (!apiKey || !base64Audio) return null
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contents: [{
            parts: [
              { text: 'Transcribe this audio verbatim. If there is only silence, music, or no clear human speech, return an empty string.' },
              { inline_data: { mime_type: 'audio/wav', data: base64Audio } }
            ]
          }]
        })
      }
    )
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    return text || null
  } catch (err) {
    console.error('[Gemini STT] Fetch error:', err.message)
    return null
  }
}

async function callGeminiNode(transcriptText, apiKey) {
  if (!apiKey) return null
  const context = previousSummary
    ? `Previous Summary: ${JSON.stringify(previousSummary)}\n\n`
    : ''
  const prompt = `${SYSTEM_PROMPT}\n\n${context}New Transcript:\n${transcriptText}`

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            contents:         [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
          })
        }
      )
      const data = await res.json()
      if (data.error) {
        const code = data.error.code
        if (code === 429 || code === 503) { continue }  // try next model
        console.error(`[Gemini] ${model} error:`, data.error.message)
        break
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) continue
      try { return JSON.parse(text) } catch (_) { continue }
    } catch (err) {
      console.error(`[Gemini] ${model} fetch failed:`, err.message)
      continue
    }
  }
  return null
}

function mergeSummary(prev, next) {
  if (!prev) return next
  const mergeArr = (a, b) => {
    const seen = new Set(a.map(x => JSON.stringify(x)))
    return [...a, ...b.filter(x => !seen.has(JSON.stringify(x)))]
  }
  const mergeByKey = (a, b, key) => {
    const map = {}
    ;[...a, ...b].forEach(x => { map[x[key]] = x })
    return Object.values(map)
  }
  return {
    key_topics:   mergeByKey([...(prev.key_topics||[]), ...(next.key_topics||[])], [], 'topic').slice(-10),
    decisions:    mergeArr(prev.decisions||[], next.decisions||[]),
    action_items: mergeByKey(prev.action_items||[], next.action_items||[], 'task'),
    deadlines:    mergeByKey(prev.deadlines||[], next.deadlines||[], 'task')
  }
}

async function runSummaryPass(force = false) {
  const key = sessionGeminiKey
  if (!key || !currentSessionId) return

  const newSegments = sessionBuffer.slice(lastSummarizedIdx)
  if (!newSegments.length && !force) return

  const textBlock = newSegments.map(s => `${s.speaker_id}: ${s.text}`).join('\n')
  const wordCount = textBlock.trim().split(/\s+/).length

  if (!force && wordCount < MIN_NEW_WORDS) return

  console.log(`[Backend] Running Gemini summary (${wordCount} words, force=${force})...`)
  const result = await callGeminiNode(textBlock, key)
  if (!result) return

  const merged = mergeSummary(previousSummary, result)
  previousSummary   = merged
  lastSummarizedIdx = sessionBuffer.length

  if (currentSessionId) saveSummary(currentSessionId, merged)
  broadcastToClients({ type: 'SUMMARY_UPDATE', session_id: currentSessionId, ...merged })
  console.log('[Backend] Summary broadcast complete.')
}

function startSummaryTimer() {
  stopSummaryTimer()
  summaryTimer = setInterval(() => runSummaryPass(false), SUMMARY_INTERVAL_MS)
}

function stopSummaryTimer() {
  if (summaryTimer) { clearInterval(summaryTimer); summaryTimer = null }
}

const speakerManager = new SpeakerMapManager()

// ── Init DB ───────────────────────────────────────────────────────────────────
initDb()

// ── Fastify ───────────────────────────────────────────────────────────────────
const app = Fastify({ logger: { level: 'warn' } })

await app.register(cors, {
  origin: ['http://localhost:5173', /https:\/\/.*\.vercel\.app$/, true],
  credentials: true
})
await app.register(websocket)

// ── Connect to Python AI sidecar ──────────────────────────────────────────────
function connectToAI() {
  console.log(`[Backend] Connecting to AI service at ${AI_WS_URL}`)
  try {
    aiSocket = new WebSocket(AI_WS_URL)

    aiSocket.on('open', () => {
      aiConnected = true
      console.log('[Backend] AI service connected')
      // Flush queue with delay
      const flush = async () => {
        while (chunkQueue.length > 0 && aiConnected) {
          aiSocket.send(JSON.stringify(chunkQueue.shift()))
          await new Promise(r => setTimeout(r, 500)) // 500ms delay between chunks
        }
      }
      flush()
    })

    aiSocket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        handleAIMessage(msg)
      } catch (e) {
        console.error('[Backend] AI message parse error:', e)
      }
    })

    aiSocket.on('close', () => {
      if (aiConnected) {
        console.log('[Backend] AI service disconnected — retrying in 3s')
        aiConnected = false
      }
      setTimeout(connectToAI, 3000)
    })

    aiSocket.on('error', (err) => {
      console.error('[Backend] AI WS error:', err.message)
    })
  } catch (err) {
    console.error('[Backend] Failed to connect to AI:', err)
    setTimeout(connectToAI, 3000)
  }
}

// ── Handle messages from AI sidecar ──────────────────────────────────────────
function handleAIMessage(msg) {
  switch (msg.type) {
    case 'TRANSCRIPT_UPDATE': {
      const segment = {
        ...msg,
        speaker_name: speakerManager.getName(currentSessionId, msg.speaker_id) || msg.speaker_id,
        id: uuidv4()
      }
      // Persist
      if (currentSessionId) {
        saveSegment(currentSessionId, segment)
      }
      // Fan-out to all renderer clients
      broadcastToClients({ ...segment })
      break
    }

    case 'SUMMARY_UPDATE': {
      const sessId = msg.session_id || currentSessionId
      if (sessId) {
        saveSummary(sessId, msg)
      }
      broadcastToClients(msg)
      break
    }

    case 'SPEAKER_SUGGEST': {
      broadcastToClients(msg)
      break
    }

    case 'DOWNLOAD_PROGRESS': {
      broadcastToClients(msg)
      // Also forward to Electron main via IPC if available
      break
    }

    case 'ERROR': {
      broadcastToClients(msg)
      break
    }

    default:
      break
  }
}

// ── WebSocket endpoint (renderer ↔ backend) ───────────────────────────────────
app.get('/ws', { websocket: true }, (socket, req) => {
  const clientId = uuidv4()
  clientsMap.set(clientId, socket)
  console.log(`[Backend] Renderer connected: ${clientId}`)

  // Send current session state if exists
  if (currentSessionId) {
    const state = getFullSession(currentSessionId)
    if (state) {
      socket.send(JSON.stringify({
        type:     'SESSION_STATE',
        segments: state.segments,
        summary:  state.summary,
        speakers: speakerManager.getAll(currentSessionId)
      }))
    }
  }

  socket.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      handleRendererMessage(msg, socket)
    } catch (e) {
      console.error('[Backend] Renderer message parse error:', e)
    }
  })

  socket.on('close', () => {
    clientsMap.delete(clientId)
    console.log(`[Backend] Renderer disconnected: ${clientId}`)
  })
})

function handleRendererMessage(msg, socket) {
  switch (msg.type) {

    case 'SESSION_CONTROL':
      if (msg.action === 'start') {
        currentSessionId = uuidv4()
        sessionBuffer = []
        lastSummarizedIdx = 0
        previousSummary = null
        startSummaryTimer()
        console.log(`[Backend] Starting new session: ${currentSessionId}`)
        if (aiConnected && aiSocket?.readyState === 1) {
          aiSocket.send(JSON.stringify({ type: 'SESSION_START', session_id: currentSessionId }))
        } else {
          console.warn('[Backend] AI Service not connected, session will start when AI is ready')
          chunkQueue.push({ type: 'SESSION_START', session_id: currentSessionId })
        }
      } else if (msg.action === 'stop') {
        console.log(`[Backend] Stopping session: ${currentSessionId}`)
        stopSummaryTimer()
        runSummaryPass(true)   // force final summary
        if (currentSessionId) {
          endSession(currentSessionId)
        }
        if (aiConnected && aiSocket?.readyState === 1) {
          aiSocket.send(JSON.stringify({ type: 'SESSION_STOP' }))
        }
      }
      break

    case 'SET_API_KEY':
      sessionGeminiKey = msg.key
      console.log('[Backend] Gemini API key received from client.')
      break

    case 'BROWSER_TRANSCRIPT': {
      const segment = {
        id:           uuidv4(),
        speaker_id:   msg.speaker_id || 'Spk_0',
        speaker_name: speakerManager.getName(currentSessionId, msg.speaker_id) || msg.speaker_id || 'Speaker',
        text:         msg.text,
        timestamp:    msg.timestamp || new Date().toISOString(),
        entities:     []
      }
      if (currentSessionId) {
        saveSegment(currentSessionId, segment)
        sessionBuffer.push({ speaker_id: segment.speaker_id, text: segment.text, timestamp: segment.timestamp })
      }
      broadcastToClients({ type: 'TRANSCRIPT_UPDATE', ...segment })
      break
    }

    case 'AUDIO_CHUNK': {
      const payload = { type: 'AUDIO_CHUNK', session_id: currentSessionId, ...msg }
      
      const audioData = msg.audio_b64 || msg.data
      if (audioData) {
        console.log(`[Backend] 🎤 Received audio chunk (${audioData.length} chars)`)
      }

      if (aiConnected && aiSocket?.readyState === 1) {
        aiSocket.send(JSON.stringify(payload))
      } else if (sessionGeminiKey && audioData && currentSessionId) {
        // Cloud / Browser mode: transcribe tab/system audio using Gemini
        transcribeAudioChunkGemini(audioData, sessionGeminiKey).then(text => {
          if (text) {
            console.log(`[Backend] Gemini transcribed chunk: "${text}"`)
            const segment = {
              id:           uuidv4(),
              speaker_id:   'Spk_0',
              speaker_name: speakerManager.getName(currentSessionId, 'Spk_0') || 'Tab Audio',
              text:         text,
              timestamp:    msg.timestamp || new Date().toISOString(),
              entities:     []
            }
            saveSegment(currentSessionId, segment)
            sessionBuffer.push({ speaker_id: segment.speaker_id, text: segment.text, timestamp: segment.timestamp })
            broadcastToClients({ type: 'TRANSCRIPT_UPDATE', ...segment })
          }
        })
      } else {
        if (chunkQueue.length < QUEUE_MAX) chunkQueue.push(payload)
        else chunkQueue.shift()
      }
      break
    }

    case 'UPDATE_SPEAKER':
      speakerManager.setName(currentSessionId, msg.speaker_id, msg.name)
      updateSpeakerMap(currentSessionId, msg.speaker_id, msg.name)
      broadcastToClients({
        type:     'SPEAKER_MAP',
        map:      speakerManager.getAll(currentSessionId)
      })
      if (aiConnected) aiSocket.send(JSON.stringify(msg))
      break

    case 'CLEAR_SESSION':
      currentSessionId = null
      sessionBuffer = []
      lastSummarizedIdx = 0
      previousSummary = null
      stopSummaryTimer()
      if (aiConnected) aiSocket.send(JSON.stringify({ type: 'CLEAR_SESSION' }))
      break

    default:
      // Forward unknown messages to AI
      if (aiConnected) aiSocket.send(JSON.stringify(msg))
  }
}

// ── REST endpoints ────────────────────────────────────────────────────────────
app.get('/health', async () => {
  return {
    status: 'ok',
    backend_version: '1.0.0',
    ai_service: aiConnected ? 'connected' : 'disconnected',
    database: 'active',
    active_session: currentSessionId
  }
})

app.get('/session/:id', async (req, reply) => {
  const session = getFullSession(req.params.id)
  if (!session) return reply.code(404).send({ error: 'Not found' })
  return session
})

app.post('/export/markdown', async (req, reply) => {
  const { session_id } = req.body
  const session = getFullSession(session_id)
  if (!session) return reply.code(404).send({ error: 'Session not found' })
  const md = exportMarkdown(session)
  reply.header('Content-Type', 'text/markdown')
  return md
})

app.post('/export/pdf', async (req, reply) => {
  const { session_id } = req.body
  const session = getFullSession(session_id)
  if (!session) return reply.code(404).send({ error: 'Session not found' })
  const pdfBuffer = await exportPDF(session)
  reply.header('Content-Type', 'application/pdf')
  return pdfBuffer
})

// ── Auto-save timer ───────────────────────────────────────────────────────────
setInterval(() => {
  if (currentSessionId) {
    // Keep internal session alive logic here if needed
  }
}, 30_000)

// ── Start ─────────────────────────────────────────────────────────────────────
await app.listen({ port: BACKEND_PORT, host: '0.0.0.0' })
console.log(`[Backend] Fastify running on port ${BACKEND_PORT}`)

connectToAI()
