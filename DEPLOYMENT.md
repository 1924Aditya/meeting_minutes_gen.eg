# SAMVAAD deployment

The browser version can run as three services: the React static site, the
Node.js API/WebSocket server, and the Python AI WebSocket service.

## Docker Compose

1. Copy `.env.example` to `.env` and set `GEMINI_API_KEY`.
2. Set `VITE_BACKEND_WS_URL` to the public WebSocket URL of the backend. For a
   local Docker deployment, keep `ws://localhost:3001/ws`.
3. Build and start the services:

   ```bash
   docker compose up --build -d
   ```

4. Open `http://localhost:8080`. Verify the backend with
   `http://localhost:3001/health`.

The SQLite database is stored in the `samvaad-data` volume. Back up this volume
before upgrading or removing the deployment.

## Hosted deployments

Deploy the same three containers to a platform that supports long-lived
WebSocket connections. The backend must be publicly reachable by the browser.
The AI service can use its Render service URL for the initial deployment.

### Render

This repository includes a `render.yaml` Blueprint. In Render, choose
**New → Blueprint**, connect this GitHub repository, and enter
`GEMINI_API_KEY` when prompted. The Blueprint creates the three services and
the frontend URL is:

```text
https://samvaad-frontend.onrender.com
```

Free Render services may sleep when idle, and the AI service may exceed free
memory limits while loading Whisper. If that happens, upgrade the AI service
only; the frontend and backend can remain on free plans.

Set these values in the backend environment:

- `AI_WS_URL=ws://<private-ai-host>:8766`
- `CORS_ORIGIN=https://<frontend-host>`
- `DATA_DIR=/data` on a persistent disk

Set `VITE_BACKEND_WS_URL=wss://<backend-host>/ws` as a frontend build
variable. Rebuild the frontend after changing it because Vite embeds this value
at build time.

The AI container downloads Whisper models on first startup and requires
significant CPU, memory, and disk. Use a persistent model cache or a machine
size appropriate for `faster-whisper`.
