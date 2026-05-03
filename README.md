# SAMVAAD — Project Structure
# =====================================

samvaad-mom-generator/
├── package.json                  # Root npm workspace
├── .env.example                  # Environment config template
├── .env                          # Your config (git-ignored)
├── setup.ps1                     # One-shot setup script (Windows)
│
├── shared/
│   └── schema.json               # WebSocket message contracts
│
├── frontend/                     # Electron + React (Vite)
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── electron/
│   │   ├── main.js               # Electron main process
│   │   └── preload.js            # contextBridge IPC (secure)
│   └── src/
│       ├── main.jsx              # React entry
│       ├── App.jsx               # Root component
│       ├── styles/
│       │   ├── index.css         # Design system (glass, tokens, utils)
│       │   └── app.css           # Layout
│       ├── components/
│       │   ├── TopBar.jsx/css    # Source selector + controls
│       │   ├── TranscriptPanel.jsx/css  # Live transcript
│       │   ├── SummaryPanel.jsx/css     # Project Pulse
│       │   ├── SpeakerMapModal.jsx/css  # Rename speakers
│       │   ├── ExportModal.jsx/css      # Export MOM
│       │   └── FirstRunScreen.jsx/css   # Setup + download
│       ├── hooks/
│       │   ├── useWebSocket.js   # WS client + reconnect
│       │   └── useAudioCapture.js # Audio capture + chunking
│       └── context/
│           └── SessionContext.jsx
│
├── backend/                      # Node.js Fastify + WS
│   ├── package.json
│   └── src/
│       ├── index.js              # Server entry + routing
│       ├── wsClients.js          # Client broadcast
│       ├── db.js                 # SQLite (better-sqlite3)
│       ├── speakerMap.js         # Speaker ID→name mapping
│       └── exporter.js           # MD + PDF export
│
└── services/
    └── ai/                       # Python AI sidecar
        ├── requirements.txt
        ├── main.py               # WS server entry
        ├── models.py             # Model manager + cache
        ├── transcriber.py        # faster-whisper
        ├── diarizer.py           # pyannote.audio
        ├── ner.py                # spaCy + regex
        └── summarizer.py         # Refine chain (Ollama/OpenAI/Gemini)
