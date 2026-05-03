import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import { v4 as uuidv4 } from 'uuid'
import WebSocket from 'ws'
import { initDb, saveSegment, updateSpeakerMap, getFullSession } from './db.js'
import { broadcastToClients, clientsMap } from './wsClients.js'
import { SpeakerMapManager } from './speakerMap.js'
import { exportMarkdown, exportPDF } from './exporter.js'

// ── Config ────────────────────────────────────────────────────────────────────
const BACKEND_PORT    = parseInt(process.env.BACKEND_PORT    || '3001')
const AI_SERVICE_PORT = parseInt(process.env.AI_SERVICE_PORT || '8766')
const AI_WS_URL       = `ws://127.0.0.1:${AI_SERVICE_PORT}`

// ── State ─────────────────────────────────────────────────────────────────────
let currentSessionId = null
let aiSocket = null
let aiConnected = false
let chunkQueue = []
const QUEUE_MAX = 10

const speakerManager = new SpeakerMapManager()

// ── Init DB ───────────────────────────────────────────────────────────────────
initDb()

// ── Fastify ───────────────────────────────────────────────────────────────────
const app = Fastify({ logger: { level: 'warn' } })

await app.register(cors, { origin: true })
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
        console.log(`[Backend] Starting new session: ${currentSessionId}`)
        if (aiConnected && aiSocket?.readyState === 1) {
          aiSocket.send(JSON.stringify({ type: 'SESSION_START', session_id: currentSessionId }))
        } else {
          console.warn('[Backend] AI Service not connected, session will start when AI is ready')
          // The AI service will receive SESSION_START when it connects via the flush queue logic
          chunkQueue.push({ type: 'SESSION_START', session_id: currentSessionId })
        }
      } else if (msg.action === 'stop') {
        console.log(`[Backend] Stopping session: ${currentSessionId}`)
        if (aiConnected && aiSocket?.readyState === 1) {
          aiSocket.send(JSON.stringify({ type: 'SESSION_STOP' }))
        }
      }
      break

    case 'AUDIO_CHUNK': {
      const payload = { type: 'AUDIO_CHUNK', session_id: currentSessionId, ...msg }
      
      // Log audio reception to verify Chrome is sending data
      if (msg.data) {
        console.log(`[Backend] 🎤 Received audio chunk (${msg.data.length} chars)`)
      }

      if (aiConnected && aiSocket?.readyState === 1) {
        aiSocket.send(JSON.stringify(payload))
      } else {
        console.log(`[Backend] AI Service not ready, queuing chunk. Queue size: ${chunkQueue.length}`)
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
