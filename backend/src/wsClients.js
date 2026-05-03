// Shared map of connected renderer WebSocket clients
export const clientsMap = new Map()

/**
 * Broadcast a JSON message to all connected renderer clients
 */
export function broadcastToClients(msg) {
  const raw = JSON.stringify(msg)
  for (const [id, socket] of clientsMap) {
    try {
      if (socket.readyState === 1) { // 1 is OPEN
        socket.send(raw)
      }
    } catch (e) {
      console.error(`[WS] Failed to send to client ${id}:`, e)
      clientsMap.delete(id)
    }
  }
}
